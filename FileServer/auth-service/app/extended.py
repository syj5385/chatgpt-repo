from __future__ import annotations

import hashlib
import io
import json
import mimetypes
import os
import secrets
import shutil
import sqlite3
import tarfile
import tempfile
import zipfile
from contextlib import closing
from datetime import timedelta
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from urllib.parse import unquote, urlparse

from fastapi import Body, Depends, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import main

app = main.app
FILES_ROOT = Path(os.getenv("FILESERVER_FILES_ROOT", "/files")).resolve()
DEFAULT_QUOTA_BYTES = max(0, int(os.getenv("FILESERVER_DEFAULT_QUOTA_BYTES", str(50 * 1024**3))))
UPLOAD_CHUNK_BYTES = max(1024 * 1024, int(os.getenv("FILESERVER_UPLOAD_CHUNK_BYTES", str(8 * 1024**2))))
VERSION_LIMIT = max(1, int(os.getenv("FILESERVER_VERSION_LIMIT", "20")))
SHARE_MAX_DAYS = max(1, int(os.getenv("FILESERVER_SHARE_MAX_DAYS", "90")))
HIDDEN_ROOTS = {".versions", ".uploads", ".metadata"}
ACTIVE_EXTENSIONS = {"html", "htm", "svg", "js", "mjs", "xhtml", "xml"}


class PathPayload(BaseModel):
    path: str


class TagsPayload(PathPayload):
    tags: list[str] = Field(default_factory=list, max_length=30)


class FavoritePayload(PathPayload):
    favorite: bool = True


class CommentPayload(PathPayload):
    comment: str = Field(min_length=1, max_length=2000)


class SharePayload(PathPayload):
    permission: str = "download"
    password: str | None = Field(default=None, max_length=128)
    expires_days: int | None = Field(default=7, ge=1, le=365)
    max_downloads: int | None = Field(default=None, ge=1, le=100000)


class RestoreVersionPayload(BaseModel):
    version_id: int


class UploadInitPayload(PathPayload):
    size: int = Field(ge=0)
    modified_at: int | None = None
    overwrite: bool = False
    relative_path: str | None = None


class UploadFinishPayload(BaseModel):
    upload_id: str


class FileOperationPayload(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=500)
    destination: str | None = None
    overwrite: bool = False


class ArchivePayload(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=500)
    destination: str


class ExtractPayload(BaseModel):
    path: str
    destination: str | None = None


class QuotaPayload(BaseModel):
    quota_bytes: int = Field(ge=0)


def feature_db() -> sqlite3.Connection:
    return main.connect()


def _column_exists(connection: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row[1] == column for row in connection.execute(f"PRAGMA table_info({table})"))


def initialize_features() -> None:
    FILES_ROOT.mkdir(parents=True, exist_ok=True)
    for directory in (FILES_ROOT / "users", FILES_ROOT / "shared", FILES_ROOT / "Trash", FILES_ROOT / ".versions", FILES_ROOT / ".uploads"):
        directory.mkdir(parents=True, exist_ok=True)

    with closing(feature_db()) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS storage_profiles (
                user_id INTEGER PRIMARY KEY,
                quota_bytes INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS file_metadata (
                path TEXT PRIMARY KEY,
                owner_user_id INTEGER,
                favorite INTEGER NOT NULL DEFAULT 0,
                tags_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS file_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                version_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                sha256 TEXT,
                actor_user_id INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_file_versions_path ON file_versions(path, id DESC);

            CREATE TABLE IF NOT EXISTS file_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT NOT NULL,
                path TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_file_activity_user ON file_activity(user_id, id DESC);
            CREATE INDEX IF NOT EXISTS idx_file_activity_path ON file_activity(path, id DESC);

            CREATE TABLE IF NOT EXISTS file_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                comment TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT NOT NULL UNIQUE,
                owner_user_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                permission TEXT NOT NULL,
                password_hash TEXT,
                expires_at TEXT,
                max_downloads INTEGER,
                downloads INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                revoked_at TEXT,
                FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS upload_sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                target_path TEXT NOT NULL,
                temp_path TEXT NOT NULL,
                total_size INTEGER NOT NULL,
                received_size INTEGER NOT NULL DEFAULT 0,
                overwrite INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        users = connection.execute("SELECT id, username FROM users WHERE status = 'approved'").fetchall()
        now = main.iso()
        for user in users:
            connection.execute(
                "INSERT OR IGNORE INTO storage_profiles(user_id, quota_bytes, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (user["id"], DEFAULT_QUOTA_BYTES, now, now),
            )
            ensure_user_directories(user["username"])
        connection.execute("DELETE FROM upload_sessions WHERE expires_at <= ?", (now,))
        connection.commit()


_original_initialize_database = main.initialize_database


def _initialize_all() -> None:
    _original_initialize_database()
    initialize_features()


main.initialize_database = _initialize_all


_original_update_user_status = main.update_user_status


def _update_user_status(*args: Any, **kwargs: Any) -> dict[str, Any]:
    result = _original_update_user_status(*args, **kwargs)
    user = result.get("user") or {}
    if user.get("status") == "approved" and user.get("username"):
        ensure_user_directories(user["username"])
        with closing(feature_db()) as connection:
            connection.execute(
                "INSERT OR IGNORE INTO storage_profiles(user_id, quota_bytes, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (user["id"], DEFAULT_QUOTA_BYTES, main.iso(), main.iso()),
            )
            connection.commit()
    return result


main.update_user_status = _update_user_status


def ensure_user_directories(username: str) -> None:
    (FILES_ROOT / "users" / username).mkdir(parents=True, exist_ok=True)
    (FILES_ROOT / "Trash" / username).mkdir(parents=True, exist_ok=True)


def clean_relative(value: str, *, directory: bool | None = None) -> str:
    value = unquote(str(value or "")).replace("\\", "/")
    value = value.split("?", 1)[0].split("#", 1)[0]
    if value.startswith("/files/"):
        value = value[7:]
    elif value == "/files":
        value = ""
    value = value.lstrip("/")
    parts: list[str] = []
    for part in PurePosixPath(value).parts:
        if part in {"", "."}:
            continue
        if part == ".." or "\x00" in part:
            raise HTTPException(status_code=400, detail="잘못된 파일 경로입니다.")
        parts.append(part)
    result = "/".join(parts)
    if parts and parts[0] in HIDDEN_ROOTS:
        raise HTTPException(status_code=403, detail="내부 저장 경로에는 접근할 수 없습니다.")
    if directory is True and result:
        result += "/"
    if directory is False:
        result = result.rstrip("/")
    return result


def disk_path(relative: str) -> Path:
    relative = clean_relative(relative).rstrip("/")
    candidate = (FILES_ROOT / relative).resolve()
    if candidate != FILES_ROOT and FILES_ROOT not in candidate.parents:
        raise HTTPException(status_code=403, detail="허용되지 않은 경로입니다.")
    return candidate


def user_roots(session: dict[str, Any]) -> tuple[str, ...]:
    if session["role"] == "admin":
        return ("",)
    username = session["username"]
    return (f"users/{username}", "shared", f"Trash/{username}")


def can_access(session: dict[str, Any], relative: str, *, write: bool = False) -> bool:
    if main.ACCESS_MODE == "public":
        return True
    relative = clean_relative(relative).rstrip("/")
    if session["role"] == "admin":
        return not any(relative == hidden or relative.startswith(hidden + "/") for hidden in HIDDEN_ROOTS)
    for root in user_roots(session):
        if relative == root or relative.startswith(root + "/"):
            return True
    return False


def require_path(session: dict[str, Any], relative: str, *, write: bool = False) -> str:
    relative = clean_relative(relative)
    if not can_access(session, relative, write=write):
        raise HTTPException(status_code=403, detail="이 파일 경로에 접근할 권한이 없습니다.")
    return relative


def directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    total = 0
    for root, dirs, files in os.walk(path):
        dirs[:] = [name for name in dirs if name not in HIDDEN_ROOTS]
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def quota_for(session: dict[str, Any]) -> int:
    if session["role"] == "admin":
        return 0
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT quota_bytes FROM storage_profiles WHERE user_id = ?", (session["id"],)).fetchone()
    return int(row["quota_bytes"]) if row else DEFAULT_QUOTA_BYTES


def usage_for(session: dict[str, Any]) -> int:
    if session["role"] == "admin":
        return directory_size(FILES_ROOT)
    return directory_size(FILES_ROOT / "users" / session["username"])


def ensure_quota(session: dict[str, Any], incoming: int, replacing: int = 0) -> None:
    quota = quota_for(session)
    if not quota or session["role"] == "admin":
        return
    if usage_for(session) + max(0, incoming - replacing) > quota:
        raise HTTPException(status_code=507, detail="사용자 저장 용량을 초과합니다.")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def record_activity(user_id: int | None, action: str, path: str, details: str | None = None) -> None:
    with closing(feature_db()) as connection:
        connection.execute(
            "INSERT INTO file_activity(user_id, action, path, details, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, action, clean_relative(path), details, main.iso()),
        )
        connection.commit()


def ensure_metadata(path: str, owner_user_id: int | None = None) -> None:
    path = clean_relative(path)
    now = main.iso()
    with closing(feature_db()) as connection:
        connection.execute(
            """
            INSERT INTO file_metadata(path, owner_user_id, favorite, tags_json, created_at, updated_at)
            VALUES (?, ?, 0, '[]', ?, ?)
            ON CONFLICT(path) DO UPDATE SET updated_at = excluded.updated_at
            """,
            (path, owner_user_id, now, now),
        )
        connection.commit()


def snapshot_file(relative: str, actor_user_id: int | None) -> None:
    relative = clean_relative(relative, directory=False)
    source = disk_path(relative)
    if not source.is_file():
        return
    version_dir = FILES_ROOT / ".versions" / hashlib.sha256(relative.encode()).hexdigest()
    version_dir.mkdir(parents=True, exist_ok=True)
    version_name = f"{main.utc_now().strftime('%Y%m%dT%H%M%S%fZ')}-{secrets.token_hex(4)}"
    destination = version_dir / version_name
    shutil.copy2(source, destination)
    digest = sha256_file(destination)
    with closing(feature_db()) as connection:
        connection.execute(
            "INSERT INTO file_versions(path, version_path, size_bytes, sha256, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (relative, str(destination.relative_to(FILES_ROOT)), destination.stat().st_size, digest, actor_user_id, main.iso()),
        )
        old = connection.execute(
            "SELECT id, version_path FROM file_versions WHERE path = ? ORDER BY id DESC LIMIT -1 OFFSET ?",
            (relative, VERSION_LIMIT),
        ).fetchall()
        for row in old:
            try:
                (FILES_ROOT / row["version_path"]).unlink(missing_ok=True)
            except OSError:
                pass
            connection.execute("DELETE FROM file_versions WHERE id = ?", (row["id"],))
        connection.commit()


def move_metadata(source: str, destination: str) -> None:
    source = clean_relative(source).rstrip("/")
    destination = clean_relative(destination).rstrip("/")
    with closing(feature_db()) as connection:
        rows = connection.execute(
            "SELECT path FROM file_metadata WHERE path = ? OR path LIKE ?", (source, source + "/%")
        ).fetchall()
        for row in rows:
            old = row["path"]
            new = destination + old[len(source):]
            connection.execute("UPDATE OR REPLACE file_metadata SET path = ?, updated_at = ? WHERE path = ?", (new, main.iso(), old))
        connection.execute("UPDATE file_versions SET path = ? || substr(path, ?) WHERE path = ? OR path LIKE ?", (destination, len(source) + 1, source, source + "/%"))
        connection.execute("UPDATE file_comments SET path = ? || substr(path, ?) WHERE path = ? OR path LIKE ?", (destination, len(source) + 1, source, source + "/%"))
        connection.commit()


def parse_destination(request: Request) -> str | None:
    value = request.headers.get("x-original-destination") or request.headers.get("destination")
    if not value:
        return None
    parsed = urlparse(value)
    return clean_relative(parsed.path or value)


def workspace_payload(session: dict[str, Any]) -> dict[str, Any]:
    ensure_user_directories(session["username"])
    home = "" if session["role"] == "admin" else f"users/{session['username']}/"
    trash = "Trash/" if session["role"] == "admin" else f"Trash/{session['username']}/"
    quota = quota_for(session)
    usage = usage_for(session)
    return {
        "mode": main.ACCESS_MODE,
        "username": session["username"],
        "role": session["role"],
        "home": home,
        "shared": "shared/",
        "trash": trash,
        "quota_bytes": quota,
        "usage_bytes": usage,
        "upload_chunk_bytes": UPLOAD_CHUNK_BYTES,
        "can_manage_all": session["role"] == "admin",
    }


app.router.routes = [
    route for route in app.router.routes
    if getattr(route, "path", None) not in {"/internal/auth/check", "/internal/auth/admin-check"}
]


def internal_authorize(request: Request, admin_only: bool = False) -> Response:
    if main.ACCESS_MODE == "public" and not admin_only:
        return Response(status_code=204, headers={"X-FileServer-Mode": "public"})
    if main.ACCESS_MODE == "public" and admin_only:
        raise HTTPException(status_code=404, detail="공개 모드에서는 관리자 페이지를 사용하지 않습니다.")

    session = main.require_session(request)
    if admin_only and session["role"] != "admin":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")

    method = request.headers.get("x-original-method", "GET").upper()
    original_uri = request.headers.get("x-original-uri", "/")
    relative = clean_relative(urlparse(original_uri).path)
    if original_uri.startswith("/files"):
        require_path(session, relative, write=method in main.MUTATING_METHODS)

    if session["must_change_password"] and (admin_only or original_uri.startswith("/files")):
        raise HTTPException(status_code=403, detail="초기 비밀번호를 먼저 변경해야 합니다.")
    if method in main.MUTATING_METHODS:
        main.require_csrf(request, session, request.headers.get("x-csrf-token"))

    if original_uri.startswith("/files"):
        destination = parse_destination(request)
        if destination:
            require_path(session, destination, write=True)
        if method == "PUT":
            incoming = int(request.headers.get("x-original-content-length") or 0)
            target = disk_path(relative)
            replacing = target.stat().st_size if target.is_file() else 0
            ensure_quota(session, incoming, replacing)
            if target.is_file():
                snapshot_file(relative, session["id"])
        elif method == "DELETE":
            target = disk_path(relative)
            if target.is_file():
                snapshot_file(relative, session["id"])
        record_activity(session["id"], method, relative, f"destination={destination}" if destination else None)

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


@app.get("/api/files/workspace")
def workspace(session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    return workspace_payload(session)


@app.get("/api/files/metadata")
def metadata(path: str, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    relative = require_path(session, path)
    target = disk_path(relative)
    if not target.exists():
        raise HTTPException(status_code=404, detail="파일 또는 폴더를 찾을 수 없습니다.")
    stat = target.stat()
    with closing(feature_db()) as connection:
        meta = connection.execute("SELECT * FROM file_metadata WHERE path = ?", (relative,)).fetchone()
        versions = connection.execute(
            "SELECT id, size_bytes, sha256, actor_user_id, created_at FROM file_versions WHERE path = ? ORDER BY id DESC LIMIT 50",
            (relative,),
        ).fetchall()
        activity = connection.execute(
            """
            SELECT a.id, a.action, a.details, a.created_at, u.username
            FROM file_activity a LEFT JOIN users u ON u.id = a.user_id
            WHERE a.path = ? OR a.path LIKE ? ORDER BY a.id DESC LIMIT 50
            """,
            (relative, relative.rstrip("/") + "/%"),
        ).fetchall()
        comments = connection.execute(
            """
            SELECT c.id, c.comment, c.created_at, u.username
            FROM file_comments c JOIN users u ON u.id = c.user_id
            WHERE c.path = ? ORDER BY c.id DESC LIMIT 100
            """,
            (relative,),
        ).fetchall()
    size = directory_size(target)
    digest = sha256_file(target) if target.is_file() and size <= 2 * 1024**3 else None
    return {
        "path": relative,
        "name": target.name or "Home",
        "directory": target.is_dir(),
        "size_bytes": size,
        "modified_at": stat.st_mtime,
        "mime_type": "directory" if target.is_dir() else (mimetypes.guess_type(target.name)[0] or "application/octet-stream"),
        "sha256": digest,
        "favorite": bool(meta["favorite"]) if meta else False,
        "tags": json.loads(meta["tags_json"]) if meta else [],
        "versions": [dict(row) for row in versions],
        "activity": [dict(row) for row in activity],
        "comments": [dict(row) for row in comments],
    }


@app.post("/api/files/tags")
def set_tags(payload: TagsPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    relative = require_path(session, payload.path, write=True)
    tags = sorted({tag.strip()[:40] for tag in payload.tags if tag.strip()})[:30]
    ensure_metadata(relative, session["id"])
    with closing(feature_db()) as connection:
        connection.execute("UPDATE file_metadata SET tags_json = ?, updated_at = ? WHERE path = ?", (json.dumps(tags, ensure_ascii=False), main.iso(), relative))
        connection.commit()
    record_activity(session["id"], "TAGS_UPDATED", relative, ", ".join(tags))
    return {"path": relative, "tags": tags}


@app.post("/api/files/favorite")
def set_favorite(payload: FavoritePayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    relative = require_path(session, payload.path, write=True)
    ensure_metadata(relative, session["id"])
    with closing(feature_db()) as connection:
        connection.execute("UPDATE file_metadata SET favorite = ?, updated_at = ? WHERE path = ?", (int(payload.favorite), main.iso(), relative))
        connection.commit()
    return {"path": relative, "favorite": payload.favorite}


@app.post("/api/files/comments")
def add_comment(payload: CommentPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    relative = require_path(session, payload.path, write=True)
    with closing(feature_db()) as connection:
        cursor = connection.execute(
            "INSERT INTO file_comments(path, user_id, comment, created_at) VALUES (?, ?, ?, ?)",
            (relative, session["id"], payload.comment.strip(), main.iso()),
        )
        connection.commit()
    record_activity(session["id"], "COMMENT_ADDED", relative)
    return {"id": cursor.lastrowid, "comment": payload.comment.strip(), "username": session["username"], "created_at": main.iso()}


def _walk_allowed(session: dict[str, Any]) -> Iterable[tuple[str, Path]]:
    roots = user_roots(session)
    for root in roots:
        base = FILES_ROOT if root == "" else FILES_ROOT / root
        if not base.exists():
            continue
        for current, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in HIDDEN_ROOTS]
            current_path = Path(current)
            relative_current = str(current_path.relative_to(FILES_ROOT)).replace(os.sep, "/")
            for directory in dirs:
                relative = f"{relative_current}/{directory}".strip("/") + "/"
                yield relative, current_path / directory
            for filename in files:
                relative = f"{relative_current}/{filename}".strip("/")
                yield relative, current_path / filename


@app.get("/api/files/search")
def search_files(
    q: str = "",
    kind: str = "all",
    min_size: int = 0,
    max_size: int = 0,
    modified_after: float = 0,
    tag: str = "",
    limit: int = 300,
    session: dict[str, Any] = Depends(main.require_session),
) -> dict[str, Any]:
    q = q.strip().casefold()
    limit = min(max(limit, 1), 1000)
    tag_paths: set[str] | None = None
    if tag:
        with closing(feature_db()) as connection:
            rows = connection.execute("SELECT path, tags_json FROM file_metadata").fetchall()
        tag_paths = {row["path"] for row in rows if tag.casefold() in {str(x).casefold() for x in json.loads(row["tags_json"])}}
    results: list[dict[str, Any]] = []
    image_ext = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"}
    video_ext = {"mp4", "mov", "mkv", "webm", "avi"}
    document_ext = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv"}
    archive_ext = {"zip", "tar", "gz", "tgz", "bz2", "xz"}
    for relative, target in _walk_allowed(session):
        name = target.name
        if q and q not in name.casefold() and q not in relative.casefold():
            continue
        try:
            stat = target.stat()
        except OSError:
            continue
        directory = target.is_dir()
        size = 0 if directory else stat.st_size
        suffix = target.suffix.lower().lstrip(".")
        if kind == "folder" and not directory:
            continue
        if kind == "image" and suffix not in image_ext:
            continue
        if kind == "video" and suffix not in video_ext:
            continue
        if kind == "document" and suffix not in document_ext:
            continue
        if kind == "archive" and suffix not in archive_ext:
            continue
        if min_size and size < min_size:
            continue
        if max_size and size > max_size:
            continue
        if modified_after and stat.st_mtime < modified_after:
            continue
        if tag_paths is not None and relative.rstrip("/") not in tag_paths:
            continue
        results.append({"path": relative, "name": name, "directory": directory, "size": size, "mtime": stat.st_mtime})
        if len(results) >= limit:
            break
    return {"results": results}


@app.get("/api/files/recent")
def recent_files(limit: int = 100, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    limit = min(max(limit, 1), 500)
    with closing(feature_db()) as connection:
        rows = connection.execute(
            """
            SELECT a.path, max(a.id) AS activity_id, max(a.created_at) AS last_activity,
                   max(a.action) AS action
            FROM file_activity a
            WHERE a.user_id = ?
            GROUP BY a.path ORDER BY activity_id DESC LIMIT ?
            """,
            (session["id"], limit * 3),
        ).fetchall()
    results = []
    for row in rows:
        if not can_access(session, row["path"]):
            continue
        target = disk_path(row["path"])
        if target.exists():
            stat = target.stat()
            results.append({"path": row["path"], "name": target.name, "directory": target.is_dir(), "size": 0 if target.is_dir() else stat.st_size, "mtime": stat.st_mtime, "action": row["action"], "last_activity": row["last_activity"]})
        if len(results) >= limit:
            break
    return {"results": results}


@app.get("/api/files/favorites")
def favorites(session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    with closing(feature_db()) as connection:
        rows = connection.execute("SELECT path FROM file_metadata WHERE favorite = 1 ORDER BY updated_at DESC").fetchall()
    results = []
    for row in rows:
        if not can_access(session, row["path"]):
            continue
        target = disk_path(row["path"])
        if target.exists():
            stat = target.stat()
            results.append({"path": row["path"], "name": target.name, "directory": target.is_dir(), "size": 0 if target.is_dir() else stat.st_size, "mtime": stat.st_mtime})
    return {"results": results}


@app.get("/api/files/activity")
def activity(limit: int = 200, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    limit = min(max(limit, 1), 1000)
    with closing(feature_db()) as connection:
        if session["role"] == "admin":
            rows = connection.execute(
                "SELECT a.*, u.username FROM file_activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?", (limit,)
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT a.*, u.username FROM file_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.user_id = ? ORDER BY a.id DESC LIMIT ?", (session["id"], limit)
            ).fetchall()
    return {"activity": [dict(row) for row in rows if can_access(session, row["path"])]}


@app.post("/api/files/uploads/init")
def upload_init(payload: UploadInitPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    relative = require_path(session, payload.path, write=True).rstrip("/")
    target = disk_path(relative)
    if target.exists() and target.is_dir():
        raise HTTPException(status_code=409, detail="같은 이름의 폴더가 존재합니다.")
    replacing = target.stat().st_size if target.is_file() else 0
    ensure_quota(session, payload.size, replacing)
    if target.exists() and not payload.overwrite:
        duplicate = target.stat().st_size == payload.size
        raise HTTPException(status_code=409, detail={"message": "같은 이름의 파일이 있습니다.", "duplicate": duplicate})
    upload_id = secrets.token_urlsafe(24)
    temp = FILES_ROOT / ".uploads" / f"{upload_id}.part"
    temp.parent.mkdir(parents=True, exist_ok=True)
    temp.write_bytes(b"")
    with closing(feature_db()) as connection:
        connection.execute(
            "INSERT INTO upload_sessions(id, user_id, target_path, temp_path, total_size, received_size, overwrite, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
            (upload_id, session["id"], relative, str(temp.relative_to(FILES_ROOT)), payload.size, int(payload.overwrite), main.iso(), main.iso(main.utc_now() + timedelta(days=1))),
        )
        connection.commit()
    return {"upload_id": upload_id, "chunk_bytes": UPLOAD_CHUNK_BYTES, "received": 0}


@app.put("/api/files/uploads/{upload_id}")
async def upload_chunk(upload_id: str, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?", (upload_id, session["id"])).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="업로드 세션을 찾을 수 없습니다.")
        offset = int(request.headers.get("x-upload-offset") or -1)
        if offset != row["received_size"]:
            raise HTTPException(status_code=409, detail={"message": "업로드 위치가 일치하지 않습니다.", "expected_offset": row["received_size"]})
        body = await request.body()
        if not body:
            return {"received": row["received_size"], "total": row["total_size"]}
        if row["received_size"] + len(body) > row["total_size"]:
            raise HTTPException(status_code=413, detail="업로드 크기가 선언된 파일 크기를 초과합니다.")
        temp = FILES_ROOT / row["temp_path"]
        with temp.open("ab") as output:
            output.write(body)
        received = row["received_size"] + len(body)
        connection.execute("UPDATE upload_sessions SET received_size = ? WHERE id = ?", (received, upload_id))
        connection.commit()
    return {"received": received, "total": row["total_size"]}


@app.post("/api/files/uploads/finish")
def upload_finish(payload: UploadFinishPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?", (payload.upload_id, session["id"])).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="업로드 세션을 찾을 수 없습니다.")
        if row["received_size"] != row["total_size"]:
            raise HTTPException(status_code=409, detail="파일 업로드가 아직 완료되지 않았습니다.")
        relative = require_path(session, row["target_path"], write=True)
        target = disk_path(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if not row["overwrite"]:
                raise HTTPException(status_code=409, detail="같은 이름의 파일이 존재합니다.")
            snapshot_file(relative, session["id"])
        temp = FILES_ROOT / row["temp_path"]
        os.replace(temp, target)
        connection.execute("DELETE FROM upload_sessions WHERE id = ?", (payload.upload_id,))
        connection.commit()
    ensure_metadata(relative, session["id"])
    record_activity(session["id"], "UPLOAD", relative, f"size={target.stat().st_size}")
    return {"path": relative, "size": target.stat().st_size, "sha256": sha256_file(target)}


@app.delete("/api/files/uploads/{upload_id}", status_code=204)
def upload_cancel(upload_id: str, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> Response:
    main.require_csrf(request, session)
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?", (upload_id, session["id"])).fetchone()
        if row:
            (FILES_ROOT / row["temp_path"]).unlink(missing_ok=True)
            connection.execute("DELETE FROM upload_sessions WHERE id = ?", (upload_id,))
            connection.commit()
    return Response(status_code=204)


def _copy_or_move(payload: FileOperationPayload, session: dict[str, Any], move: bool) -> list[str]:
    if not payload.destination:
        raise HTTPException(status_code=422, detail="대상 폴더가 필요합니다.")
    destination_relative = require_path(session, payload.destination, write=True)
    destination_dir = disk_path(destination_relative)
    destination_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for source_value in payload.paths:
        source_relative = require_path(session, source_value, write=True).rstrip("/")
        source = disk_path(source_relative)
        if not source.exists():
            raise HTTPException(status_code=404, detail=f"{source_relative} 항목을 찾을 수 없습니다.")
        target_relative = clean_relative(destination_relative.rstrip("/") + "/" + source.name)
        require_path(session, target_relative, write=True)
        target = disk_path(target_relative)
        if target.exists():
            if not payload.overwrite:
                raise HTTPException(status_code=409, detail=f"{target.name} 항목이 이미 존재합니다.")
            if target.is_dir():
                shutil.rmtree(target)
            else:
                snapshot_file(target_relative, session["id"])
                target.unlink()
        if move:
            shutil.move(str(source), str(target))
            move_metadata(source_relative, target_relative)
            record_activity(session["id"], "MOVE", source_relative, f"destination={target_relative}")
        else:
            if source.is_dir():
                shutil.copytree(source, target)
            else:
                ensure_quota(session, source.stat().st_size)
                shutil.copy2(source, target)
            record_activity(session["id"], "COPY", source_relative, f"destination={target_relative}")
        results.append(target_relative + ("/" if target.is_dir() else ""))
    return results


@app.post("/api/files/move")
def move_items(payload: FileOperationPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    return {"paths": _copy_or_move(payload, session, True)}


@app.post("/api/files/copy")
def copy_items(payload: FileOperationPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    return {"paths": _copy_or_move(payload, session, False)}


def _safe_archive_name(relative: str) -> str:
    name = Path(relative.rstrip("/")).name
    return name or "archive"


@app.post("/api/files/archive")
def create_archive(payload: ArchivePayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    destination_relative = require_path(session, payload.destination, write=True).rstrip("/")
    if not destination_relative.lower().endswith(".zip"):
        destination_relative += ".zip"
    destination = disk_path(destination_relative)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        snapshot_file(destination_relative, session["id"])
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for item in payload.paths:
            relative = require_path(session, item)
            target = disk_path(relative)
            if not target.exists():
                continue
            if target.is_dir():
                base = target.parent
                for current, _, files in os.walk(target):
                    for filename in files:
                        source = Path(current) / filename
                        archive.write(source, str(source.relative_to(base)))
            else:
                archive.write(target, target.name)
    ensure_metadata(destination_relative, session["id"])
    record_activity(session["id"], "ARCHIVE_CREATED", destination_relative)
    return {"path": destination_relative, "size": destination.stat().st_size}


def _safe_extract_path(base: Path, member: str) -> Path:
    target = (base / member).resolve()
    if target != base and base not in target.parents:
        raise HTTPException(status_code=400, detail="압축 파일에 안전하지 않은 경로가 포함되어 있습니다.")
    return target


@app.post("/api/files/extract")
def extract_archive(payload: ExtractPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    source_relative = require_path(session, payload.path)
    source = disk_path(source_relative)
    if not source.is_file():
        raise HTTPException(status_code=404, detail="압축 파일을 찾을 수 없습니다.")
    default_destination = str(PurePosixPath(source_relative).parent / source.stem)
    destination_relative = require_path(session, payload.destination or default_destination, write=True)
    destination = disk_path(destination_relative)
    destination.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            for member in archive.infolist():
                _safe_extract_path(destination, member.filename)
            archive.extractall(destination)
    elif tarfile.is_tarfile(source):
        with tarfile.open(source) as archive:
            for member in archive.getmembers():
                _safe_extract_path(destination, member.name)
            archive.extractall(destination, filter="data")
    else:
        raise HTTPException(status_code=415, detail="지원하지 않는 압축 형식입니다.")
    record_activity(session["id"], "ARCHIVE_EXTRACTED", source_relative, f"destination={destination_relative}")
    return {"path": destination_relative + "/"}


@app.post("/api/files/versions/restore")
def restore_version(payload: RestoreVersionPayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT * FROM file_versions WHERE id = ?", (payload.version_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="파일 버전을 찾을 수 없습니다.")
    relative = require_path(session, row["path"], write=True)
    version = FILES_ROOT / row["version_path"]
    if not version.is_file():
        raise HTTPException(status_code=404, detail="버전 파일이 존재하지 않습니다.")
    target = disk_path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file():
        snapshot_file(relative, session["id"])
    shutil.copy2(version, target)
    record_activity(session["id"], "VERSION_RESTORED", relative, f"version_id={payload.version_id}")
    return {"path": relative, "size": target.stat().st_size}


@app.get("/api/files/versions/{version_id}")
def download_version(version_id: int, session: dict[str, Any] = Depends(main.require_session)) -> FileResponse:
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT * FROM file_versions WHERE id = ?", (version_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="파일 버전을 찾을 수 없습니다.")
    require_path(session, row["path"])
    version = FILES_ROOT / row["version_path"]
    return FileResponse(version, filename=Path(row["path"]).name, media_type="application/octet-stream")


@app.post("/api/files/shares")
def create_share(payload: SharePayload, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    main.require_csrf(request, session)
    relative = require_path(session, payload.path)
    target = disk_path(relative)
    if not target.exists():
        raise HTTPException(status_code=404, detail="공유할 파일을 찾을 수 없습니다.")
    if payload.permission not in {"download", "upload"}:
        raise HTTPException(status_code=422, detail="지원하지 않는 공유 권한입니다.")
    token = secrets.token_urlsafe(32)
    token_digest = hashlib.sha256(token.encode()).hexdigest()
    password_hash = main.PASSWORD_HASHER.hash(payload.password) if payload.password else None
    expires = main.iso(main.utc_now() + timedelta(days=min(payload.expires_days or 7, SHARE_MAX_DAYS))) if payload.expires_days else None
    with closing(feature_db()) as connection:
        connection.execute(
            "INSERT INTO shares(token_hash, owner_user_id, path, permission, password_hash, expires_at, max_downloads, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (token_digest, session["id"], relative, payload.permission, password_hash, expires, payload.max_downloads, main.iso()),
        )
        connection.commit()
    record_activity(session["id"], "SHARE_CREATED", relative, f"permission={payload.permission}")
    return {"url": f"/share/{token}", "token": token, "expires_at": expires, "permission": payload.permission}


@app.get("/api/files/shares")
def list_shares(session: dict[str, Any] = Depends(main.require_session)) -> dict[str, Any]:
    with closing(feature_db()) as connection:
        if session["role"] == "admin":
            rows = connection.execute("SELECT id, owner_user_id, path, permission, expires_at, max_downloads, downloads, created_at, revoked_at FROM shares ORDER BY id DESC").fetchall()
        else:
            rows = connection.execute("SELECT id, owner_user_id, path, permission, expires_at, max_downloads, downloads, created_at, revoked_at FROM shares WHERE owner_user_id = ? ORDER BY id DESC", (session["id"],)).fetchall()
    return {"shares": [dict(row) for row in rows]}


@app.delete("/api/files/shares/{share_id}", status_code=204)
def revoke_share(share_id: int, request: Request, session: dict[str, Any] = Depends(main.require_session)) -> Response:
    main.require_csrf(request, session)
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT * FROM shares WHERE id = ?", (share_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="공유 링크를 찾을 수 없습니다.")
        if session["role"] != "admin" and row["owner_user_id"] != session["id"]:
            raise HTTPException(status_code=403, detail="공유 링크를 해제할 권한이 없습니다.")
        connection.execute("UPDATE shares SET revoked_at = ? WHERE id = ?", (main.iso(), share_id))
        connection.commit()
    return Response(status_code=204)


def _share_row(token: str) -> sqlite3.Row:
    digest = hashlib.sha256(token.encode()).hexdigest()
    with closing(feature_db()) as connection:
        row = connection.execute("SELECT * FROM shares WHERE token_hash = ? AND revoked_at IS NULL", (digest,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="공유 링크가 존재하지 않거나 종료되었습니다.")
    expires = main.parse_time(row["expires_at"])
    if expires and expires <= main.utc_now():
        raise HTTPException(status_code=410, detail="공유 링크가 만료되었습니다.")
    if row["max_downloads"] and row["downloads"] >= row["max_downloads"]:
        raise HTTPException(status_code=410, detail="공유 링크의 다운로드 횟수가 모두 사용되었습니다.")
    return row


def _share_login_html(token: str, message: str = "") -> str:
    safe_message = message.replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!doctype html><html lang='ko'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>공유 파일</title><style>body{{font-family:system-ui;background:#f3f3f3;display:grid;place-items:center;min-height:100vh;margin:0}}form{{width:min(380px,90vw);background:white;padding:24px;border-radius:12px;box-shadow:0 12px 32px #0002}}input,button{{width:100%;height:42px;margin-top:10px;box-sizing:border-box}}p{{color:#b42318}}</style></head><body><form method='post' action='/share/{token}'><h2>공유 파일</h2><div>비밀번호를 입력하세요.</div><input name='password' type='password' required autofocus><button>열기</button><p>{safe_message}</p></form></body></html>"""


def _stream_shared(row: sqlite3.Row) -> Response:
    target = disk_path(row["path"])
    if not target.exists():
        raise HTTPException(status_code=404, detail="공유된 파일이 삭제되었습니다.")
    with closing(feature_db()) as connection:
        connection.execute("UPDATE shares SET downloads = downloads + 1 WHERE id = ?", (row["id"],))
        connection.commit()
    if target.is_file():
        disposition = "attachment" if target.suffix.lower().lstrip(".") in ACTIVE_EXTENSIONS else "attachment"
        return FileResponse(target, filename=target.name, media_type="application/octet-stream", content_disposition_type=disposition)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for current, _, files in os.walk(target):
            for filename in files:
                source = Path(current) / filename
                archive.write(source, str(source.relative_to(target.parent)))
    buffer.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{target.name}.zip"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)


@app.get("/share/{token}")
def public_share(token: str) -> Response:
    row = _share_row(token)
    if row["permission"] == "upload":
        return HTMLResponse("업로드 전용 공유는 다음 버전에서 별도 제출 화면으로 제공됩니다.", status_code=501)
    if row["password_hash"]:
        return HTMLResponse(_share_login_html(token))
    return _stream_shared(row)


@app.post("/share/{token}")
async def public_share_password(token: str, request: Request) -> Response:
    row = _share_row(token)
    form = await request.form()
    password = str(form.get("password") or "")
    if not row["password_hash"] or not main.verify_password(row["password_hash"], password):
        return HTMLResponse(_share_login_html(token, "비밀번호가 올바르지 않습니다."), status_code=401)
    return _stream_shared(row)


@app.get("/api/admin/storage")
def admin_storage(_: dict[str, Any] = Depends(main.require_admin)) -> dict[str, Any]:
    with closing(feature_db()) as connection:
        users = connection.execute(
            """
            SELECT u.id, u.username, u.status, coalesce(s.quota_bytes, ?) AS quota_bytes
            FROM users u LEFT JOIN storage_profiles s ON s.user_id = u.id
            ORDER BY u.username
            """, (DEFAULT_QUOTA_BYTES,)
        ).fetchall()
        shares = connection.execute("SELECT count(*) AS count FROM shares WHERE revoked_at IS NULL").fetchone()["count"]
    entries = []
    for user in users:
        used = directory_size(FILES_ROOT / "users" / user["username"])
        entries.append({**dict(user), "used_bytes": used})
    stat = shutil.disk_usage(FILES_ROOT)
    return {"users": entries, "disk": {"total": stat.total, "used": stat.used, "free": stat.free}, "active_shares": shares}


@app.post("/api/admin/storage/{user_id}/quota")
def set_user_quota(user_id: int, payload: QuotaPayload, request: Request, admin: dict[str, Any] = Depends(main.require_admin)) -> dict[str, Any]:
    main.require_csrf(request, admin)
    with closing(feature_db()) as connection:
        user = connection.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
        connection.execute(
            """
            INSERT INTO storage_profiles(user_id, quota_bytes, created_at, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET quota_bytes = excluded.quota_bytes, updated_at = excluded.updated_at
            """,
            (user_id, payload.quota_bytes, main.iso(), main.iso()),
        )
        connection.commit()
    return {"user_id": user_id, "quota_bytes": payload.quota_bytes}
