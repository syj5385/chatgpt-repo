from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request

from . import extended, full, main

app = full.app


# The explorer normally sends a complete repository-relative path such as
# users/alice/report.pdf. During initial navigation failures or older cached
# clients it can send a path relative to the user's home, such as report.pdf.
# Resolve only those relative paths into the authenticated user's own home.
# Explicit paths targeting another user remain forbidden.
def resolve_user_upload_path(session: dict[str, Any], value: str) -> str:
    relative = extended.clean_relative(value, directory=False)

    if extended.can_access(session, relative, write=True):
        return relative

    if main.ACCESS_MODE == "public" or session["role"] == "admin":
        raise HTTPException(status_code=403, detail="이 파일 경로에 접근할 권한이 없습니다.")

    username = str(session["username"])
    parts = [part for part in relative.split("/") if part]
    if not parts:
        raise HTTPException(status_code=400, detail="업로드할 파일 경로가 비어 있습니다.")

    first = parts[0].casefold()

    # Canonicalize a case-only difference in an explicitly supplied personal
    # path, while still rejecting every other user's directory.
    if first == "users":
        if len(parts) < 2 or parts[1].casefold() != username.casefold():
            raise HTTPException(status_code=403, detail="다른 사용자의 개인 폴더에는 업로드할 수 없습니다.")
        candidate = "/".join(["users", username, *parts[2:]])
    elif first == "trash":
        if len(parts) < 2 or parts[1].casefold() != username.casefold():
            raise HTTPException(status_code=403, detail="다른 사용자의 휴지통에는 업로드할 수 없습니다.")
        candidate = "/".join(["Trash", username, *parts[2:]])
    elif first == "shared":
        candidate = "/".join(["shared", *parts[1:]])
    elif first == username.casefold():
        # Compatibility with a legacy client that used <username>/file.
        candidate = "/".join(["users", username, *parts[1:]])
    else:
        # A bare file name or subdirectory is relative to the user's home.
        candidate = "/".join(["users", username, *parts])

    candidate = extended.clean_relative(candidate, directory=False)
    if not extended.can_access(session, candidate, write=True):
        raise HTTPException(
            status_code=403,
            detail=f"사용자 홈 폴더 /users/{username}/ 안에서만 업로드할 수 있습니다.",
        )
    return candidate


# Replace the original upload initialization route. The remaining chunk and
# finish routes use the canonical target saved by this endpoint.
app.router.routes = [
    route
    for route in app.router.routes
    if getattr(route, "path", None) != "/api/files/uploads/init"
]


@app.post("/api/files/uploads/init")
def upload_init_hotfix(
    payload: extended.UploadInitPayload,
    request: Request,
    session: dict[str, Any] = Depends(main.require_session),
) -> dict[str, Any]:
    canonical_path = resolve_user_upload_path(session, payload.path)
    corrected = payload.model_copy(update={"path": canonical_path})
    return extended.upload_init(corrected, request, session)
