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

if ! command -v curl >/dev/null 2>&1; then
  echo "오류: 서비스 상태 확인에 필요한 curl 명령을 찾을 수 없습니다." >&2
  exit 1
fi

echo "[1/4] Compose 설정을 확인합니다."
docker compose -f config.yaml config --quiet

echo "[2/4] FileServer 이미지와 컨테이너를 다시 생성합니다."
docker compose -f config.yaml up -d --build --force-recreate --remove-orphans

echo "[3/4] 컨테이너 상태를 확인합니다."
docker compose -f config.yaml ps

HTTP_BIND="$(docker compose -f config.yaml port fileserver 80 2>/dev/null | head -n 1 || true)"
HTTPS_BIND="$(docker compose -f config.yaml port fileserver 443 2>/dev/null | head -n 1 || true)"
HTTP_PORT="${HTTP_BIND##*:}"
HTTPS_PORT="${HTTPS_BIND##*:}"

if [ -z "$HTTPS_PORT" ]; then
  echo "오류: HTTPS 포트 매핑을 확인할 수 없습니다." >&2
  docker compose -f config.yaml logs --tail=100 >&2
  exit 1
fi

echo "[4/4] 인증 API와 HTTPS 응답을 확인합니다."
HEALTH_URL="https://localhost:${HTTPS_PORT}/api/auth/config"
READY=0
for _ in $(seq 1 30); do
  if curl -ksSf --max-time 3 "$HEALTH_URL" >/tmp/fileserver-health.json 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "오류: FileServer가 HTTPS 요청에 정상 응답하지 않습니다." >&2
  docker compose -f config.yaml ps >&2
  docker compose -f config.yaml logs --tail=150 >&2
  exit 1
fi

echo
echo "FileServer 재시작과 응답 확인이 완료되었습니다."
if [ -n "$HTTP_PORT" ]; then
  echo "HTTP  : http://localhost:$HTTP_PORT"
else
  echo "HTTP  : 포트 매핑을 확인할 수 없습니다."
fi
echo "HTTPS : https://localhost:$HTTPS_PORT"
echo "API   : $(cat /tmp/fileserver-health.json)"
rm -f /tmp/fileserver-health.json
