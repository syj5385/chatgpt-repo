# FileExplore Android

`FileServer` 웹 화면을 Android WebView로 사용하는 전용 클라이언트입니다. 서버는 변경하지 않고, 앱에서 서버 주소만 설정해 접속합니다.

## 주요 기능

- 첫 실행 시 FileExplore 서버 주소 저장
- JavaScript, DOM Storage, 쿠키 및 로그인 세션 유지
- 파일 선택 및 여러 파일 업로드
- 인증 쿠키를 포함한 Android 다운로드 관리자 연동
- HTTP Basic Auth 입력창
- 자체 서명 TLS 인증서 경고와 사용자 승인 흐름
- 새로고침, 서버 주소 변경, WebView 방문 기록 기반 뒤로가기
- 스마트폰, 태블릿, 폴더블에서 회전/리사이즈 가능한 단일 화면

## 서버 주소 예시

```text
https://192.168.0.10:18443
http://192.168.0.10:18080
```

스킴을 생략하면 `https://`가 자동으로 붙습니다. HTTP 접속도 허용하지만 외부 네트워크에서는 HTTPS 사용을 권장합니다.

## 자체 서명 인증서

`FileServer`가 자체 서명 인증서를 사용하면 앱에서 경고가 표시됩니다. 임시로 이번 연결만 계속할 수 있지만, 권장 방식은 서버 인증서를 Android 사용자 인증서 저장소에 설치하는 것입니다. 앱의 네트워크 보안 설정은 시스템 인증서와 사용자가 설치한 인증서를 모두 신뢰합니다.

## 빌드

Android Studio에서 `FileExploreAndroid` 폴더를 열어 실행하거나, JDK 17과 Gradle 8.9 환경에서 다음 명령을 실행합니다.

```bash
gradle :app:assembleDebug
```

생성되는 APK:

```text
app/build/outputs/apk/debug/app-debug.apk
```

저장소의 GitHub Actions 워크플로도 같은 Debug APK를 artifact로 업로드합니다.

## 현재 제한

- Android WebView 파일 선택기는 여러 파일 업로드를 지원하지만, 웹의 `webkitdirectory`를 완전한 폴더 트리 업로드로 변환하지는 않습니다.
- `blob:` URL 다운로드는 Android DownloadManager로 전달할 수 없어 지원하지 않습니다. FileServer의 일반 HTTP/HTTPS 다운로드 URL은 지원합니다.
- TLS 인증서 경고에서 “이번 연결만 계속”을 선택하면 해당 WebView 연결에서만 검증을 우회합니다. 인증서 설치가 더 안전합니다.
