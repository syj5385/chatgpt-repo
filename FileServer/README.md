# FileServer

Windows 11 파일 탐색기와 비슷한 UI를 제공하는 Nginx/WebDAV 기반 웹 파일 탐색기입니다. 실제 파일 저장소는 호스트의 `FileServer/files`이며 컨테이너의 `/files`에 마운트됩니다.

현재 버전은 다음 두 가지 접속 모드를 지원합니다.

- `private`: 관리자에게 승인된 계정만 사용
- `public`: 로그인 없이 누구나 사용

기본값은 안전한 `private` 모드입니다.

## 빠른 실행

```bash
cd /Users/yyjun.song/workspace/FileServer
cp -n .env.example .env
bash restart.sh
```

기본 접속 주소:

```text
HTTP  : http://localhost:5080  → HTTPS로 자동 이동
HTTPS : https://localhost:5443
```

처음 생성되는 인증서는 self-signed 인증서이므로 브라우저에 보안 경고가 표시됩니다. 인증서 정보를 확인한 뒤 HTTPS 접속을 계속해야 로그인 쿠키가 정상적으로 동작합니다.

## 계정 모드

`.env`에서 다음 값을 사용합니다.

```env
FILESERVER_ACCESS_MODE=private
FILESERVER_ADMIN_USER=admin
FILESERVER_ADMIN_PASSWORD=admin
```

최초 관리자 계정:

```text
ID       : admin
Password : admin
```

최초 로그인 직후에는 비밀번호 변경 화면으로 이동하며, 초기 비밀번호를 변경하기 전에는 파일과 관리자 페이지를 사용할 수 없습니다.

관리자 비밀번호 환경변수는 **계정 DB가 처음 만들어질 때만** 사용됩니다. 이미 `auth-data/auth.db`가 존재한다면 `.env`의 비밀번호를 바꾸어도 기존 관리자 비밀번호가 변경되지 않습니다.

### 사용자 등록과 승인

1. 로그인 화면에서 `사용자 등록`을 선택합니다.
2. 사용자 ID와 비밀번호를 입력해 승인 요청을 보냅니다.
3. 계정은 `pending` 상태로 저장됩니다.
4. 관리자가 `/admin` 페이지에서 승인 또는 거절합니다.
5. 승인된 사용자는 등록한 ID와 비밀번호로 로그인할 수 있습니다.

지원 상태:

```text
pending    승인 대기
approved   승인 완료
rejected   승인 거절
disabled   사용 중지
```

관리자 페이지:

```text
https://localhost:5443/admin
```

관리자 페이지에서는 다음 작업을 할 수 있습니다.

- 사용자 승인과 거절
- 사용자 사용 중지와 재활성화
- 승인·로그인·비밀번호 변경 등의 감사 로그 조회

### 자동 로그인

로그인 화면에서 `이 기기에서 자동 로그인`을 선택하면 기본 30일 동안 유지되는 보안 세션 쿠키가 생성됩니다.

- 비밀번호를 브라우저에 저장하지 않음
- 쿠키는 `HttpOnly`, `Secure`, `SameSite=Lax` 사용
- 서버 DB에는 원본 세션 토큰 대신 SHA-256 해시 저장
- 로그아웃하거나 계정이 중지되면 세션 폐기

설정값:

```env
FILESERVER_SESSION_HOURS=12
FILESERVER_REMEMBER_DAYS=30
FILESERVER_PASSWORD_MIN_LENGTH=8
FILESERVER_COOKIE_SECURE=true
```

### 비밀번호 저장 방식

비밀번호는 암호화 후 복호화하는 방식으로 저장하지 않습니다. 사용자마다 별도의 salt를 사용하는 Argon2id 해시만 SQLite에 저장합니다.

계정 DB 위치:

```text
auth-data/auth.db
```

`auth-data/`는 Git에서 제외됩니다. 이 디렉터리를 삭제하면 모든 사용자, 승인 상태, 세션과 감사 로그가 초기화되고 관리자 계정도 다시 생성됩니다.

## 공개 모드

계정 없이 기존 파일 탐색기를 바로 열려면 `.env`를 다음처럼 변경합니다.

```env
FILESERVER_ACCESS_MODE=public
```

그다음 컨테이너를 다시 생성합니다.

```bash
bash restart.sh
```

공개 모드에서는 로그인과 사용자 등록이 필요하지 않지만, 방문자는 파일 조회뿐 아니라 업로드·수정·이동·삭제도 수행할 수 있습니다. 신뢰할 수 있는 내부 네트워크에서만 사용하세요.

## 컨테이너 재시작

```bash
cd /Users/yyjun.song/workspace/FileServer
bash restart.sh
```

스크립트가 실행하는 핵심 명령:

```bash
docker compose -f config.yaml up -d --build --force-recreate --remove-orphans
```

현재 상태 확인:

```bash
docker compose -f config.yaml ps
docker compose -f config.yaml logs --tail=100
docker compose -f config.yaml logs auth --tail=100
docker compose -f config.yaml logs fileserver --tail=100
```

## LAN IP로 HTTPS 접속

예를 들어 Mac의 IP가 `192.168.0.20`이면 `.env`에 다음 값을 설정합니다.

```env
FILESERVER_CERT_CN=192.168.0.20
FILESERVER_CERT_SAN=DNS:localhost,IP:127.0.0.1,IP:192.168.0.20
```

기존 자동 생성 인증서를 삭제하고 다시 시작합니다.

```bash
rm -f certs/fileserver.crt certs/fileserver.key
bash restart.sh
```

접속 주소:

```text
https://192.168.0.20:5443
```

self-signed 인증서는 IP가 SAN에 포함되어 있어도 신뢰기관 경고가 나타날 수 있습니다.

## 직접 발급한 인증서 사용

다음 파일명으로 인증서를 배치합니다.

```text
certs/fileserver.crt
certs/fileserver.key
```

두 파일이 존재하면 자동 생성하지 않고 해당 인증서를 사용합니다.

## 디렉터리 구조

```text
FileServer/
├── auth-service/             # FastAPI 인증·승인 서비스
│   ├── app/main.py
│   ├── Dockerfile
│   └── requirements.txt
├── auth-ui/                  # 로그인·등록·관리자 화면
├── auth-data/                # SQLite 계정 DB, Git 제외
├── certs/                    # TLS 인증서
├── files/                    # 실제 파일 저장소
│   └── Trash/
├── auth-client.js            # 파일 탐색기 세션·CSRF 연동
├── config.yaml
├── Dockerfile
├── index.html
├── nginx-default.conf
├── restart.sh
└── .env.example
```

## 주요 URL

```text
/                 파일 탐색기
/login            로그인
/register         사용자 등록
/change-password  비밀번호 변경
/admin            관리자 페이지
/api/auth/*       로그인·등록·세션 API
/api/admin/*      관리자 API
/files/*          인증으로 보호되는 WebDAV 파일 경로
```

## 주요 기능

- 관리자와 일반 사용자 역할 분리
- 신규 사용자 승인·거절 절차
- Argon2id 비밀번호 해싱
- 서버 저장형 세션과 자동 로그인
- 관리자 사용자 관리 페이지와 감사 로그
- `public` / `private` 실행 모드
- `/files/` GET·PUT·DELETE·MOVE·COPY·MKCOL 서버 측 인증 검사
- 변경 요청 CSRF 검사
- HTTP 요청을 HTTPS로 자동 리디렉션
- 디렉터리 탐색, 검색, 정렬, 브레드크럼 이동
- 즐겨찾기와 접을 수 있는 사이드바
- 파일 업로드와 드래그 앤 드롭 업로드
- 드래그 앤 드롭 폴더 재귀 업로드 및 빈 폴더 보존
- 모든 업로드 완료 시 업로드 패널 자동 닫기
- 파일 다운로드 및 브라우저 기반 폴더 ZIP 다운로드
- 데스크톱 Chromium 파일 드래그아웃 다운로드
- 파일 열기·편집·다운로드 선택
- 이미지 및 PDF 첫 페이지 썸네일
- ESC 키로 열린 팝업·모달·패널 닫기
- 공유 링크 접속 시 파일 정보를 확인한 뒤 직접 다운로드
- HTML 파일은 새 브라우저 탭에서 열기
- 미리보기 미지원 파일은 정보 확인 후 직접 다운로드
- 수정 가능한 파일은 정보 확인 후 편집기 열기
- Markdown 파일 문서 미리보기
- 파일 플로팅에서 공유 링크 생성
- 공유 링크 해제 시 관리 목록에서 즉시 제거
- Pac-Man 이미지를 브라우저 탭 아이콘으로 사용
- 일반 삭제 시 Trash 이동
- 라이트·다크 테마

## 확인 명령

Nginx와 Compose 설정:

```bash
docker compose -f config.yaml config
docker exec FileServer nginx -t
```

인증 설정 확인:

```bash
curl -k https://localhost:5443/api/auth/config
```

비로그인 상태에서 private 모드의 파일 요청은 `401 Unauthorized`를 반환해야 합니다.

```bash
curl -ki https://localhost:5443/files/
```

루트 페이지는 로그인 화면으로 리디렉션되어야 합니다.

```bash
curl -ki https://localhost:5443/
```

공개 모드에서는 `/files/`가 로그인 없이 JSON 목록을 반환합니다.

## 보안 주의사항

- 실제 인터넷 공개 시 self-signed 인증서 대신 신뢰되는 TLS 인증서를 사용하세요.
- 기본 `admin/admin`은 초기화 전용이므로 최초 로그인 즉시 변경하세요.
- `.env`, `auth-data/`, 인증서 개인키를 Git에 커밋하지 마세요.
- 공개 모드는 모든 파일 변경 권한도 공개되므로 내부망에서만 사용하세요.
- SQLite DB에는 비밀번호 원문이 없지만 사용자 ID와 감사 로그는 평문 메타데이터로 저장됩니다. 디스크 전체 암호화가 필요한 환경에서는 FileVault 같은 호스트 암호화를 함께 사용하세요.
- 폴더 ZIP은 브라우저 메모리에서 생성되므로 매우 큰 폴더에는 적합하지 않습니다.
