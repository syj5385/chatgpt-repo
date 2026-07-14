from __future__ import annotations

import hashlib
import os
import re
import secrets
import sqlite3
from contextlib import asynccontextmanager, closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field


DB_PATH = Path(os.getenv("FILESERVER_AUTH_DB", "/data/auth.db"))
ACCESS_MODE = os.getenv("FILESERVER_ACCESS_MODE", "private").strip().lower()
ADMIN_USER = os.getenv("FILESERVER_ADMIN_USER", "admin").strip()
ADMIN_PASSWORD = os.getenv("FILESERVER_ADMIN_PASSWORD", "admin")
COOKIE_NAME = os.getenv("FILESERVER_SESSION_COOKIE", "fileserver_session")
COOKIE_SECURE = os.getenv("FILESERVER_COOKIE_SECURE", "true").strip().lower() not in {"0", "false", "no"}
SESSION_HOURS = max(1, int(os.getenv("FILESERVER_SESSION_HOURS", "12")))
REMEMBER_DAYS = max(1, int(os.getenv("FILESERVER_REMEMBER_DAYS", "30")))
PASSWORD_MIN_LENGTH = max(8, int(os.getenv("FILESERVER_PASSWORD_MIN_LENGTH", "8")))
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE", "MKCOL", "MOVE", "COPY"}

if ACCESS_MODE not in {"public", "private"}:
    raise RuntimeError("FILESERVER_ACCESS_MODE must be 'public' or 'private'")
if not USERNAME_PATTERN.fullmatch(ADMIN_USER):
    raise RuntimeError("FILESERVER_ADMIN_USER must contain 3-32 letters, numbers, '.', '_' or '-'")

PASSWORD_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2, hash_len=32, salt_len=16)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat(timespec="seconds")


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as connection:
        connection.executescript(
            """
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'disabled')),
                must_change_password INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                approved_at TEXT,
                approved_by INTEGER,
                rejected_at TEXT,
                disabled_at TEXT,
                last_login_at TEXT,
                failed_login_count INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                FOREIGN KEY(approved_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                csrf_token TEXT NOT NULL,
                persistent INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT,
                user_agent TEXT,
                ip_address TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_user_id INTEGER,
                action TEXT NOT NULL,
                target_user_id INTEGER,
                details TEXT,
                ip_address TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(actor_user_id) REFERENCES users(id),
                FOREIGN KEY(target_user_id) REFERENCES users(id)
            );
            """
        )
        admin = connection.execute(
            "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (ADMIN_USER,)
        ).fetchone()
        if admin is None:
            now = iso()
            cursor = connection.execute(
                """
                INSERT INTO users (
                    username, password_hash, role, status, must_change_password,
                    created_at, approved_at
                ) VALUES (?, ?, 'admin', 'approved', 1, ?, ?)
                """,
                (ADMIN_USER, PASSWORD_HASHER.hash(ADMIN_PASSWORD), now, now),
            )
            connection.execute(
                """
                INSERT INTO audit_logs (actor_user_id, action, target_user_id, details, created_at)
                VALUES (?, 'ADMIN_BOOTSTRAPPED', ?, 'Initial administrator account created', ?)
                """,
                (cursor.lastrowid, cursor.lastrowid, now),
            )
        connection.execute(
            "DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL", (iso(),)
        )
        connection.commit()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    if forwarded:
        return forwarded
    return request.client.host if request.client else "unknown"


def audit(
    connection: sqlite3.Connection,
    action: str,
    request: Request,
    actor_user_id: int | None = None,
    target_user_id: int | None = None,
    details: str | None = None,
) -> None:
    connection.execute(
        """
        INSERT INTO audit_logs (
            actor_user_id, action, target_user_id, details, ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (actor_user_id, action, target_user_id, details, client_ip(request), iso()),
    )


def public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "status": row["status"],
        "must_change_password": bool(row["must_change_password"]),
        "created_at": row["created_at"],
        "approved_at": row["approved_at"],
        "rejected_at": row["rejected_at"],
        "disabled_at": row["disabled_at"],
        "last_login_at": row["last_login_at"],
        "locked_until": row["locked_until"],
    }


def validate_username(username: str) -> str:
    username = username.strip()
    if not USERNAME_PATTERN.fullmatch(username):
        raise HTTPException(
            status_code=422,
            detail="사용자 ID는 3~32자의 영문, 숫자, 마침표, 밑줄 또는 하이픈만 사용할 수 있습니다.",
        )
    return username


def validate_password(password: str) -> str:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"비밀번호는 {PASSWORD_MIN_LENGTH}자 이상이어야 합니다.",
        )
    if len(password) > 128:
        raise HTTPException(status_code=422, detail="비밀번호는 128자 이하여야 합니다.")
    return password


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return PASSWORD_HASHER.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_session(connection: sqlite3.Connection, user_id: int, remember: bool, request: Request) -> tuple[str, str, datetime]:
    raw_token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)
    now = utc_now()
    expires_at = now + (timedelta(days=REMEMBER_DAYS) if remember else timedelta(hours=SESSION_HOURS))
    connection.execute(
        """
        INSERT INTO sessions (
            user_id, token_hash, csrf_token, persistent, created_at,
            last_seen_at, expires_at, user_agent, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            token_hash(raw_token),
            csrf_token,
            int(remember),
            iso(now),
            iso(now),
            iso(expires_at),
            request.headers.get("user-agent", "")[:512],
            client_ip(request),
        ),
    )
    return raw_token, csrf_token, expires_at


def set_session_cookie(response: Response, raw_token: str, remember: bool, expires_at: datetime) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=raw_token,
        max_age=int((expires_at - utc_now()).total_seconds()) if remember else None,
        expires=expires_at if remember else None,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", secure=COOKIE_SECURE, httponly=True, samesite="lax")


def get_session(request: Request, required: bool = True) -> dict[str, Any] | None:
    raw_token = request.cookies.get(COOKIE_NAME)
    if not raw_token:
        if required:
            raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
        return None

    with closing(connect()) as connection:
        row = connection.execute(
            """
            SELECT
                s.id AS session_id, s.csrf_token, s.persistent, s.expires_at,
                u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.revoked_at IS NULL
            """,
            (token_hash(raw_token),),
        ).fetchone()
        if row is None:
            if required:
                raise HTTPException(status_code=401, detail="세션이 유효하지 않습니다.")
            return None

        expires_at = parse_time(row["expires_at"])
        if expires_at is None or expires_at <= utc_now():
            connection.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (iso(), row["session_id"]))
            connection.commit()
            if required:
                raise HTTPException(status_code=401, detail="로그인 세션이 만료되었습니다.")
            return None

        if row["status"] != "approved":
            connection.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (iso(), row["session_id"]))
            connection.commit()
            if required:
                raise HTTPException(status_code=403, detail="사용할 수 없는 계정입니다.")
            return None

        connection.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (iso(), row["session_id"]))
        connection.commit()
        return dict(row)


def require_session(request: Request) -> dict[str, Any]:
    session = get_session(request, required=True)
    assert session is not None
    return session


def require_admin(session: dict[str, Any] = Depends(require_session)) -> dict[str, Any]:
    if session["role"] != "admin":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return session


def require_csrf(request: Request, session: dict[str, Any], supplied: str | None = None) -> None:
    token = supplied or request.headers.get("x-csrf-token")
    if not token or not secrets.compare_digest(token, session["csrf_token"]):
        raise HTTPException(status_code=403, detail="보안 토큰이 올바르지 않습니다. 페이지를 새로고침하세요.")


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)
    remember: bool = False


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="FileServer Auth", version="1.0.0", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": ACCESS_MODE}


@app.get("/api/auth/config")
def auth_config() -> dict[str, Any]:
    return {
        "mode": ACCESS_MODE,
        "authentication_required": ACCESS_MODE == "private",
        "registration_enabled": ACCESS_MODE == "private",
        "password_min_length": PASSWORD_MIN_LENGTH,
        "remember_days": REMEMBER_DAYS,
    }


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest, request: Request) -> dict[str, str]:
    if ACCESS_MODE != "private":
        raise HTTPException(status_code=409, detail="공개 모드에서는 사용자 등록이 필요하지 않습니다.")

    username = validate_username(payload.username)
    password = validate_password(payload.password)
    if username.casefold() == ADMIN_USER.casefold():
        raise HTTPException(status_code=409, detail="사용할 수 없는 사용자 ID입니다.")

    with closing(connect()) as connection:
        existing = connection.execute(
            "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="이미 사용 중인 사용자 ID입니다.")

        cursor = connection.execute(
            """
            INSERT INTO users (username, password_hash, role, status, created_at)
            VALUES (?, ?, 'user', 'pending', ?)
            """,
            (username, PASSWORD_HASHER.hash(password), iso()),
        )
        audit(
            connection,
            "USER_REGISTER_REQUEST",
            request,
            target_user_id=cursor.lastrowid,
            details=f"username={username}",
        )
        connection.commit()
    return {"status": "pending", "message": "사용자 등록 요청이 접수되었습니다. 관리자 승인을 기다려주세요."}


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request, response: Response) -> dict[str, Any]:
    if ACCESS_MODE != "private":
        return {"mode": "public", "redirect": "/"}

    username = payload.username.strip()
    now = utc_now()
    with closing(connect()) as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
        ).fetchone()

        locked = user and (parse_time(user["locked_until"]) or datetime.min.replace(tzinfo=timezone.utc)) > now
        valid = bool(user) and not locked and verify_password(user["password_hash"], payload.password)

        if not valid:
            if user:
                failures = int(user["failed_login_count"]) + 1
                locked_until = iso(now + timedelta(minutes=15)) if failures >= 5 else None
                connection.execute(
                    "UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?",
                    (failures, locked_until, user["id"]),
                )
                audit(connection, "LOGIN_FAILED", request, target_user_id=user["id"])
                connection.commit()
            raise HTTPException(
                status_code=429 if locked else 401,
                detail="로그인 시도가 제한되었습니다. 잠시 후 다시 시도하세요." if locked else "사용자 ID 또는 비밀번호가 올바르지 않습니다.",
            )

        if user["status"] == "pending":
            raise HTTPException(status_code=403, detail="관리자 승인을 기다리고 있는 계정입니다.")
        if user["status"] == "rejected":
            raise HTTPException(status_code=403, detail="관리자가 등록 요청을 거절한 계정입니다.")
        if user["status"] == "disabled":
            raise HTTPException(status_code=403, detail="사용이 중지된 계정입니다.")

        raw_token, csrf_token, expires_at = create_session(connection, user["id"], payload.remember, request)
        connection.execute(
            """
            UPDATE users
            SET failed_login_count = 0, locked_until = NULL, last_login_at = ?
            WHERE id = ?
            """,
            (iso(), user["id"]),
        )
        audit(connection, "LOGIN_SUCCESS", request, actor_user_id=user["id"], target_user_id=user["id"])
        connection.commit()

    set_session_cookie(response, raw_token, payload.remember, expires_at)
    return {
        "authenticated": True,
        "username": user["username"],
        "role": user["role"],
        "must_change_password": bool(user["must_change_password"]),
        "csrf_token": csrf_token,
    }


@app.get("/api/auth/me")
def me(request: Request) -> dict[str, Any]:
    if ACCESS_MODE == "public":
        return {"mode": "public", "authenticated": False, "role": "public"}
    session = require_session(request)
    return {
        "mode": "private",
        "authenticated": True,
        "user": public_user(session),
        "csrf_token": session["csrf_token"],
        "persistent": bool(session["persistent"]),
        "expires_at": session["expires_at"],
    }


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, session: dict[str, Any] = Depends(require_session)) -> Response:
    require_csrf(request, session)
    with closing(connect()) as connection:
        connection.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (iso(), session["session_id"]))
        audit(connection, "SESSION_REVOKED", request, actor_user_id=session["id"], target_user_id=session["id"])
        connection.commit()
    clear_session_cookie(response)
    response.status_code = 204
    return response


@app.post("/api/auth/change-password")
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, str]:
    require_csrf(request, session)
    new_password = validate_password(payload.new_password)
    if not verify_password(session["password_hash"], payload.current_password):
        raise HTTPException(status_code=401, detail="현재 비밀번호가 올바르지 않습니다.")
    if payload.current_password == new_password:
        raise HTTPException(status_code=422, detail="새 비밀번호는 현재 비밀번호와 달라야 합니다.")

    with closing(connect()) as connection:
        connection.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
            (PASSWORD_HASHER.hash(new_password), session["id"]),
        )
        connection.execute(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL",
            (iso(), session["id"], session["session_id"]),
        )
        audit(connection, "PASSWORD_CHANGED", request, actor_user_id=session["id"], target_user_id=session["id"])
        connection.commit()
    return {"message": "비밀번호를 변경했습니다."}


@app.get("/api/admin/users")
def admin_users(_: dict[str, Any] = Depends(require_admin)) -> dict[str, list[dict[str, Any]]]:
    with closing(connect()) as connection:
        rows = connection.execute(
            "SELECT * FROM users ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC"
        ).fetchall()
    return {"users": [public_user(row) for row in rows]}


def update_user_status(
    user_id: int,
    next_status: str,
    action: str,
    request: Request,
    admin: dict[str, Any],
) -> dict[str, Any]:
    require_csrf(request, admin)
    with closing(connect()) as connection:
        target = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
        if target["role"] == "admin":
            raise HTTPException(status_code=403, detail="이 화면에서는 관리자 계정을 변경할 수 없습니다.")

        fields: dict[str, Any] = {
            "status": next_status,
            "approved_at": None,
            "approved_by": None,
            "rejected_at": None,
            "disabled_at": None,
        }
        if next_status == "approved":
            fields["approved_at"] = iso()
            fields["approved_by"] = admin["id"]
        elif next_status == "rejected":
            fields["rejected_at"] = iso()
        elif next_status == "disabled":
            fields["disabled_at"] = iso()

        connection.execute(
            """
            UPDATE users
            SET status = ?, approved_at = ?, approved_by = ?, rejected_at = ?, disabled_at = ?
            WHERE id = ?
            """,
            (
                fields["status"],
                fields["approved_at"],
                fields["approved_by"],
                fields["rejected_at"],
                fields["disabled_at"],
                user_id,
            ),
        )
        if next_status != "approved":
            connection.execute(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (iso(), user_id),
            )
        audit(
            connection,
            action,
            request,
            actor_user_id=admin["id"],
            target_user_id=user_id,
            details=f"status={next_status}",
        )
        connection.commit()
        updated = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"user": public_user(updated)}


@app.post("/api/admin/users/{user_id}/approve")
def approve_user(user_id: int, request: Request, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return update_user_status(user_id, "approved", "USER_APPROVED", request, admin)


@app.post("/api/admin/users/{user_id}/reject")
def reject_user(user_id: int, request: Request, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return update_user_status(user_id, "rejected", "USER_REJECTED", request, admin)


@app.post("/api/admin/users/{user_id}/disable")
def disable_user(user_id: int, request: Request, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return update_user_status(user_id, "disabled", "USER_DISABLED", request, admin)


@app.post("/api/admin/users/{user_id}/enable")
def enable_user(user_id: int, request: Request, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return update_user_status(user_id, "approved", "USER_ENABLED", request, admin)


@app.get("/api/admin/audit-logs")
def audit_logs(limit: int = 100, _: dict[str, Any] = Depends(require_admin)) -> dict[str, list[dict[str, Any]]]:
    limit = min(max(limit, 1), 500)
    with closing(connect()) as connection:
        rows = connection.execute(
            """
            SELECT
                a.id, a.action, a.details, a.ip_address, a.created_at,
                actor.username AS actor_username,
                target.username AS target_username
            FROM audit_logs a
            LEFT JOIN users actor ON actor.id = a.actor_user_id
            LEFT JOIN users target ON target.id = a.target_user_id
            ORDER BY a.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return {"logs": [dict(row) for row in rows]}


def internal_authorize(request: Request, admin_only: bool = False) -> Response:
    if ACCESS_MODE == "public" and not admin_only:
        return Response(status_code=204, headers={"X-FileServer-Mode": "public"})
    if ACCESS_MODE == "public" and admin_only:
        raise HTTPException(status_code=404, detail="공개 모드에서는 관리자 페이지를 사용하지 않습니다.")

    session = require_session(request)
    if admin_only and session["role"] != "admin":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")

    original_method = request.headers.get("x-original-method", "GET").upper()
    original_uri = request.headers.get("x-original-uri", "/")
    if session["must_change_password"] and (admin_only or original_uri.startswith("/files")):
        raise HTTPException(status_code=403, detail="초기 비밀번호를 먼저 변경해야 합니다.")
    if original_method in MUTATING_METHODS:
        require_csrf(request, session, request.headers.get("x-csrf-token"))

    return Response(
        status_code=204,
        headers={
            "X-Auth-User": session["username"],
            "X-Auth-Role": session["role"],
            "X-FileServer-Mode": "private",
        },
    )


@app.get("/internal/auth/check", status_code=204)
def internal_auth_check(request: Request) -> Response:
    return internal_authorize(request, admin_only=False)


@app.get("/internal/auth/admin-check", status_code=204)
def internal_admin_check(request: Request) -> Response:
    return internal_authorize(request, admin_only=True)
