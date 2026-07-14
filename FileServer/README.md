# FileServer

Windows 11 파일 탐색기와 비슷한 UI를 제공하는 Nginx/WebDAV 기반 웹 파일 탐색기입니다. 실제 파일 저장소는 호스트의 `FileServer/files`이며 컨테이너의 `/files`에 마운트됩니다.

HTTPS로 파일을 제공하며 HTTP 요청은 HTTPS로 자동 리디렉션됩니다. TLS 인증서가 없으면 컨테이너 시작 시 self-signed 인증서를 자동으로 생성합니다.

## 실행

```bash
cd /Users/yyjun.song/workspace/FileServer
docker compose -f config.yaml up -d --build
```

기본 접속 주소:

```text
HTTP  : http://localhost:18080  → HTTPS로 자동 이동
HTTPS : https://localhost:18443
```

처음 생성되는 인증서는 self-signed 인증서이므로 브라우저에 보안 경고가 표시됩니다. 로컬 테스트에서는 인증서 정보를 확인한 뒤 접속을 계속할 수 있습니다.

## 컨테이너 재시작

저장소에 포함된 스크립트를 실행하면 Compose 설정 확인, 이미지 재빌드, 컨테이너 재생성 및 상태 확인을 한 번에 수행합니다.

```bash
cd /Users/yyjun.song/workspace/FileServer
bash restart.sh
```

실행 권한을 부여한 뒤 직접 실행할 수도 있습니다.

```bash
chmod +x restart.sh
./restart.sh
```

스크립트가 내부적으로 실행하는 핵심 명령은 다음과 같습니다.

```bash
docker compose -f config.yaml up -d --build --force-recreate --remove-orphans
```

포트를 변경한 환경에서도 같은 스크립트를 사용할 수 있습니다.

```bash
FILESERVER_PORT=19090 \
FILESERVER_HTTPS_PORT=19443 \
bash restart.sh
```

## 포트 변경

```bash
FILESERVER_PORT=19090 \
FILESERVER_HTTPS_PORT=19443 \
docker compose -f config.yaml up -d --build
```

HTTPS를 표준 포트 443으로 열려면 다음처럼 실행합니다.

```bash
FILESERVER_HTTPS_PORT=443 docker compose -f config.yaml up -d --build
```

## LAN IP로 HTTPS 접속

다른 PC나 스마트폰에서 서버의 LAN IP로 접속하려면 해당 IP가 인증서의 Subject Alternative Name에 포함되어야 합니다.

예를 들어 Mac의 IP가 `192.168.0.20`이면 기존 자동 생성 인증서를 지운 뒤 다음처럼 다시 실행합니다.

```bash
rm -f certs/fileserver.crt certs/fileserver.key

FILESERVER_CERT_CN=192.168.0.20 \
FILESERVER_CERT_SAN="DNS:localhost,IP:127.0.0.1,IP:192.168.0.20" \
bash restart.sh
```

접속 주소:

```text
https://192.168.0.20:18443
```

self-signed 인증서이므로 LAN IP가 인증서에 포함되어 있더라도 인증기관 신뢰 경고는 계속 표시될 수 있습니다.

## 직접 발급한 인증서 사용

자동 생성 인증서 대신 신뢰할 수 있는 인증서 또는 `mkcert`로 만든 인증서를 사용할 수 있습니다.

다음 파일명으로 인증서를 배치합니다.

```text
certs/fileserver.crt
certs/fileserver.key
```

두 파일이 존재하면 컨테이너는 인증서를 새로 생성하지 않고 해당 인증서를 사용합니다.

인증서를 교체한 뒤 다음 명령으로 컨테이너를 다시 생성합니다.

```bash
bash restart.sh
```

## 디렉터리 구조

```text
FileServer/
├── Dockerfile
├── config.yaml
├── index.html
├── file-actions.js
├── nginx-default.conf
├── restart.sh
├── certs/
│   ├── fileserver.crt       # 자동 생성 또는 사용자 인증서
│   └── fileserver.key       # 자동 생성 또는 사용자 개인키
└── files/
    └── Trash/
```

- `/`: 파일 탐색기 UI
- `/file-actions.js`: 파일 더블클릭 작업 선택 및 편집 UI
- `/files/`: Nginx autoindex JSON 및 WebDAV 엔드포인트
- `./files`: 실제 파일 저장소
- `./files/Trash`: 삭제 항목 저장소
- `./certs`: TLS 인증서와 개인키 저장소

## 주요 기능

- HTTP 요청을 HTTPS로 자동 리디렉션
- 디렉터리 탐색, 검색, 정렬, 뒤로/앞으로/상위 이동
- 파일 업로드 버튼 및 드래그 앤 드롭 업로드
- 파일 다운로드 및 브라우저 기반 폴더 ZIP 다운로드
- 파일 더블클릭 시 열기, 편집, 다운로드 선택
- WebDAV `MKCOL`, `PUT`, `MOVE`, `DELETE`
- 새 텍스트 파일 생성과 5MB 이하 파일 편집
- 일반 삭제 시 Trash 이동, Trash에서는 영구 삭제
- 속성 모달, 컨텍스트 메뉴, 키보드 탐색

## 확인 명령

```bash
docker compose -f config.yaml config
docker compose -f config.yaml ps
docker compose -f config.yaml logs --tail=100
docker exec FileServer nginx -t
curl -kI http://localhost:18080/
curl -kI https://localhost:18443/
curl -k https://localhost:18443/files/
```

HTTP 응답은 `308 Permanent Redirect`와 HTTPS 주소를 가리키는 `Location` 헤더를 반환해야 합니다.

`-k` 옵션은 self-signed 인증서를 사용하는 로컬 테스트를 위한 것입니다. 정식으로 신뢰되는 인증서를 설치한 경우에는 사용하지 않아도 됩니다.

인증서 정보 확인:

```bash
openssl s_client -connect localhost:18443 -servername localhost </dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

WebDAV 동작 확인:

```bash
curl -ki -X MKCOL https://localhost:18443/files/Test/
printf 'hello\n' > /tmp/fileserver-test.txt
curl -ki -X PUT --data-binary @/tmp/fileserver-test.txt \
  https://localhost:18443/files/Test/test.txt
curl -ki https://localhost:18443/files/Test/test.txt
```

## 알려진 제약사항

- 자동 생성 인증서는 self-signed 인증서이므로 브라우저 신뢰 경고가 발생합니다.
- 폴더 ZIP은 브라우저 메모리에서 생성되므로 매우 큰 폴더에는 적합하지 않습니다.
- 편집은 5MB 이하 파일만 지원하며 바이너리 파일은 편집할 수 없습니다.
- Linux 파일시스템 규칙을 사용하므로 Windows 예약 이름에 대해서는 경고만 표시합니다.
- Nginx worker는 Docker Desktop bind mount에서 쓰기 권한을 단순화하기 위해 컨테이너 내부에서 root로 실행됩니다.

## 보안 주의사항

HTTPS는 전송 구간을 암호화하지만 사용자 인증을 제공하지는 않습니다. 이 서버는 인증 없이 파일 업로드, 수정, 이동 및 삭제 기능을 제공합니다. 신뢰할 수 없는 네트워크나 인터넷에 그대로 공개하지 마십시오. 외부 공개가 필요하면 TLS와 함께 로그인 인증, VPN, 방화벽 또는 인증 기능이 있는 역방향 프록시를 적용해야 합니다.
