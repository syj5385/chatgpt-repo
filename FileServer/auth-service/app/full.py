from __future__ import annotations

import html
import os
import secrets
from contextlib import closing
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from . import extended, main

app = extended.app
PUBLIC_UPLOAD_MAX_BYTES = max(
    1024 * 1024,
    int(os.getenv("FILESERVER_PUBLIC_UPLOAD_MAX_BYTES", str(2 * 1024**3))),
)


class LockPayload(BaseModel):
    path: str
    minutes: int = Field(default=60, ge=5, le=1440)


def initialize_full_features() -> None:
    with closing(main.connect()) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS file_locks (
                path TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_file_locks_expires ON file_locks(expires_at);
            """
        )
        connection.execute("DELETE FROM file_locks WHERE expires_at <= ?", (main.iso(),))
        connection.commit()


_previous_initialize = main.initialize_database


def _initialize_all() -> None:
    _previous_initialize()
    initialize_full_features()


main.initialize_database = _initialize_all


def get_lock(path: str) -> dict[str, Any] | None:
    relative = extended.clean_relative(path).rstrip("/")
    with closing(main.connect()) as connection:
        row = connection.execute(
            """
            SELECT l.path, l.user_id, l.created_at, l.expires_at, u.username
            FROM file_locks l JOIN users u ON u.id = l.user_id
            WHERE l.path = ? AND l.expires_at > ?
            """,
            (relative, main.iso()),
        ).fetchone()
    return dict(row) if row else None


_original_internal_authorize = extended.internal_authorize


def _locked_internal_authorize(request: Request, admin_only: bool = False) -> Response:
    original_uri = request.headers.get("x-original-uri", "/")
    method = request.headers.get("x-original-method", "GET").upper()
    if main.ACCESS_MODE == "private" and original_uri.startswith("/files") and method in main.MUTATING_METHODS:
        session = main.require_session(request)
        relative = extended.clean_relative(urlparse(original_uri).path).rstrip("/")
        lock = get_lock(relative)
        if lock and lock["user_id"] != session["id"] and session["role"] != "admin":
            raise HTTPException(status_code=423, detail=f"{lock['username']} 사용자가 파일을 잠갔습니다.")
    return _original_internal_authorize(request, admin_only)


extended.internal_authorize = _locked_internal_authorize


@app.get("/api/files/lock")
def read_lock(path: str, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    relative = extended.require_path(session, path)
    return {"lock": get_lock(relative)}


@app.post("/api/files/lock")
def lock_file(payload: LockPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    relative = extended.require_path(session, payload.path, write=True).rstrip("/")
    target = extended.disk_path(relative)
    if not target.is_file():
        raise HTTPException(status_code=400, detail="파일만 잠글 수 있습니다.")
    current = get_lock(relative)
    if current and current["user_id"] != session["id"] and session["role"] != "admin":
        raise HTTPException(status_code=423, detail=f"{current['username']} 사용자가 이미 파일을 잠갔습니다.")
    expires = main.iso(main.utc_now() + timedelta(minutes=payload.minutes))
    with closing(main.connect()) as connection:
        connection.execute(
            """
            INSERT INTO file_locks(path, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET user_id = excluded.user_id, created_at = excluded.created_at, expires_at = excluded.expires_at
            """,
            (relative, session["id"], main.iso(), expires),
        )
        connection.commit()
    extended.record_activity(session["id"], "FILE_LOCKED", relative, f"expires={expires}")
    return {"lock": get_lock(relative)}


@app.delete("/api/files/lock", status_code=204)
def unlock_file(path: str, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> Response:
    main.require_csrf(request, session)
    relative = extended.require_path(session, path, write=True).rstrip("/")
    current = get_lock(relative)
    if current and current["user_id"] != session["id"] and session["role"] != "admin":
        raise HTTPException(status_code=403, detail="다른 사용자의 파일 잠금을 해제할 수 없습니다.")
    with closing(main.connect()) as connection:
        connection.execute("DELETE FROM file_locks WHERE path = ?", (relative,))
        connection.commit()
    extended.record_activity(session["id"], "FILE_UNLOCKED", relative)
    return Response(status_code=204)


app.router.routes = [
    route for route in app.router.routes
    if getattr(route, "path", None) != "/share/{token}"
]


def upload_share_html(token: str, row: Any, message: str = "", success: bool = False) -> str:
    target = html.escape(str(row["path"]))
    safe_message = html.escape(message)
    password = "<label>비밀번호<input name='password' type='password' required></label>" if row["password_hash"] else ""
    color = "#16803c" if success else "#b42318"
    max_size = html.escape(f"{PUBLIC_UPLOAD_MAX_BYTES / 1024**3:.1f}GB")
    return f"""<!doctype html><html lang='ko'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>파일 제출</title><style>body{{font-family:system-ui;background:#f3f3f3;display:grid;place-items:center;min-height:100vh;margin:0}}form{{width:min(440px,92vw);background:white;padding:24px;border-radius:12px;box-shadow:0 12px 32px #0002}}label{{display:grid;gap:6px;margin:14px 0}}input,button{{width:100%;min-height:42px;box-sizing:border-box}}button{{background:#0067c0;color:white;border:0;border-radius:7px;font-weight:600}}p{{color:{color}}}.muted{{color:#666;font-size:13px}}</style></head><body><form method='post' action='/share/{token}' enctype='multipart/form-data'><h2>파일 제출</h2><div class='muted'>제출 위치: {target}</div><div class='muted'>파일당 최대 크기: {max_size}</div>{password}<label>파일 선택<input name='upload' type='file' required multiple></label><button>업로드</button><p>{safe_message}</p></form></body></html>"""


def share_owner_session(owner_user_id: int) -> dict[str, Any]:
    with closing(main.connect()) as connection:
        row = connection.execute(
            "SELECT id, username, role, status FROM users WHERE id = ?",
            (owner_user_id,),
        ).fetchone()
    if not row or row["status"] != "approved":
        raise HTTPException(status_code=410, detail="공유 링크 소유자 계정을 사용할 수 없습니다.")
    return dict(row)


@app.get("/share/{token}")
def public_share(token: str) -> Response:
    row = extended._share_row(token)
    if row["permission"] == "upload":
        target = extended.disk_path(row["path"])
        if not target.is_dir():
            raise HTTPException(status_code=409, detail="업로드 공유 대상이 폴더가 아닙니다.")
        return HTMLResponse(upload_share_html(token, row))
    if row["password_hash"]:
        return HTMLResponse(extended._share_login_html(token))
    return extended._stream_shared(row)


@app.post("/share/{token}")
async def public_share_post(
    token: str,
    request: Request,
    password: str = Form(default=""),
    upload: list[UploadFile] | None = File(default=None),
) -> Response:
    row = extended._share_row(token)
    if row["password_hash"] and not main.verify_password(row["password_hash"], password):
        if row["permission"] == "upload":
            return HTMLResponse(upload_share_html(token, row, "비밀번호가 올바르지 않습니다."), status_code=401)
        return HTMLResponse(extended._share_login_html(token, "비밀번호가 올바르지 않습니다."), status_code=401)
    if row["permission"] != "upload":
        return extended._stream_shared(row)

    destination = extended.disk_path(row["path"])
    if not destination.is_dir():
        raise HTTPException(status_code=409, detail="업로드 공유 대상이 폴더가 아닙니다.")
    uploads = upload or []
    if not uploads:
        return HTMLResponse(upload_share_html(token, row, "파일을 선택하세요."), status_code=422)

    owner = share_owner_session(row["owner_user_id"])
    saved: list[str] = []
    for item in uploads:
        original = Path(item.filename or "upload.bin").name
        safe_name = "".join(ch for ch in original if ch not in "\\/\x00").strip() or f"upload-{secrets.token_hex(4)}.bin"
        target = destination / safe_name
        if target.exists():
            stem, suffix = target.stem, target.suffix
            for index in range(1, 10000):
                candidate = destination / f"{stem} ({index}){suffix}"
                if not candidate.exists():
                    target = candidate
                    break

        temp = extended.FILES_ROOT / ".uploads" / f"public-{secrets.token_urlsafe(20)}.part"
        written = 0
        try:
            with temp.open("wb") as output:
                while chunk := await item.read(1024 * 1024):
                    written += len(chunk)
                    if written > PUBLIC_UPLOAD_MAX_BYTES:
                        raise HTTPException(status_code=413, detail="공유 업로드 파일의 최대 크기를 초과했습니다.")
                    output.write(chunk)
            extended.ensure_quota(owner, written)
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(temp, target)
        except Exception:
            temp.unlink(missing_ok=True)
            raise

        relative = str(target.relative_to(extended.FILES_ROOT)).replace(os.sep, "/")
        extended.ensure_metadata(relative, row["owner_user_id"])
        extended.record_activity(row["owner_user_id"], "PUBLIC_UPLOAD", relative, f"size={written}")
        saved.append(target.name)
    return HTMLResponse(upload_share_html(token, row, f"{len(saved)}개 파일을 업로드했습니다.", success=True))
