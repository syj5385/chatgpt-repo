#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "오류: docker 명령을 찾을 수 없습니다." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "오류: Docker Compose v2를 사용할 수 없습니다." >&2
  exit 1
fi

echo "[1/3] Compose 설정을 확인합니다."
docker compose -f config.yaml config --quiet

echo "[2/3] FileServer 이미지와 컨테이너를 다시 생성합니다."
docker compose -f config.yaml up -d --build --force-recreate --remove-orphans

echo "[3/3] 컨테이너 상태를 확인합니다."
docker compose -f config.yaml ps

echo
echo "FileServer 재시작이 완료되었습니다."
echo "HTTP  : http://localhost:${FILESERVER_PORT:-18080}"
echo "HTTPS : https://localhost:${FILESERVER_HTTPS_PORT:-18443}"
