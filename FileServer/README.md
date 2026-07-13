# FileServer

Windows 11 파일 탐색기와 비슷한 UI를 제공하는 Nginx/WebDAV 기반 웹 파일 탐색기입니다. 실제 파일 저장소는 호스트의 `FileServer/files`이며 컨테이너의 `/files`에 마운트됩니다.

## 실행

```bash
cd /Users/yyjun.song/workspace/FileServer
docker compose -f config.yaml up -d --build
```

기본 접속 주소는 `http://localhost:18080`입니다. 다른 포트를 사용하려면 다음처럼 실행합니다.

```bash
FILESERVER_PORT=19090 docker compose -f config.yaml up -d --build
```

## 디렉터리 구조

```text
FileServer/
├── Dockerfile
├── config.yaml
├── index.html
├── nginx-default.conf
└── files/
    └── Trash/
```

- `/`: 파일 탐색기 UI
- `/files/`: Nginx autoindex JSON 및 WebDAV 엔드포인트
- `./files`: 실제 파일 저장소
- `./files/Trash`: 삭제 항목 저장소

## 주요 기능

- 디렉터리 탐색, 검색, 정렬, 뒤로/앞으로/상위 이동
- 파일 업로드 및 드래그 앤 드롭
- 파일 다운로드 및 브라우저 기반 폴더 ZIP 다운로드
- WebDAV `MKCOL`, `PUT`, `MOVE`, `DELETE`
- 새 텍스트 파일 생성과 5MB 이하 텍스트 파일 편집
- 일반 삭제 시 Trash 이동, Trash에서는 영구 삭제
- 속성 모달, 컨텍스트 메뉴, 키보드 탐색

## 확인 명령

```bash
docker compose -f config.yaml config
docker compose -f config.yaml ps
docker compose -f config.yaml logs --tail=100
docker exec FileServer nginx -t
curl -I http://localhost:18080/
curl http://localhost:18080/files/
```

WebDAV 동작 확인:

```bash
curl -i -X MKCOL http://localhost:18080/files/Test/
printf 'hello\n' > /tmp/fileserver-test.txt
curl -i -X PUT --data-binary @/tmp/fileserver-test.txt \
  http://localhost:18080/files/Test/test.txt
curl -i http://localhost:18080/files/Test/test.txt
```

## 알려진 제약사항

- 폴더 ZIP은 브라우저 메모리에서 생성되므로 매우 큰 폴더에는 적합하지 않습니다.
- 텍스트 편집은 5MB 이하 파일만 지원합니다.
- Linux 파일시스템 규칙을 사용하므로 Windows 예약 이름에 대해서는 경고만 표시합니다.
- Nginx worker는 Docker Desktop bind mount에서 쓰기 권한을 단순화하기 위해 컨테이너 내부에서 root로 실행됩니다.

## 보안 주의사항

이 서버는 인증 없이 파일 업로드, 수정, 이동 및 삭제 기능을 제공합니다. 신뢰할 수 없는 네트워크나 인터넷에 그대로 공개하지 마십시오. 외부 공개가 필요하면 TLS와 인증 또는 VPN/역방향 프록시를 추가해야 합니다.
