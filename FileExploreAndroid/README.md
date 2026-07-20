# FileExplore Android

`FileServer` 웹 화면을 Android WebView로 사용하는 전용 클라이언트입니다. 서버는 변경하지 않고, 앱에서 서버 주소만 설정해 접속합니다.

## 주요 기능

- 첫 실행 시 FileExplore 서버 주소 저장
- JavaScript, DOM Storage, 쿠키 및 로그인 세션 유지
- 파일 선택 및 여러 파일 업로드
- 로그인 쿠키와 승인된 인증서를 사용하는 앱 자체 다운로드
- 다운로드 완료 후 설치된 앱으로 열기 제안 및 Android 앱 선택기 연동
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

`FileServer`가 자체 서명 인증서를 사용하면 앱에서 경고가 표시됩니다. 사용자가 계속을 선택하면 이번 앱 실행 동안 같은 호스트의 동일한 인증서에만 접속과 다운로드를 허용합니다. 장기적으로는 서버 인증서를 Android 사용자 인증서 저장소에 설치하거나 신뢰되는 인증서를 사용하는 방식을 권장합니다.

## 다운로드와 파일 열기

다운로드 파일은 시스템의 공용 `Downloads` 영역에 저장됩니다. 저장이 완료되면 앱이 파일을 열지 묻고, `열기`를 선택하면 MIME 타입에 맞는 설치 앱을 Android 선택 창에 표시합니다. 서버가 일반 바이너리 타입을 반환하는 경우에는 파일 확장자로 MIME 타입을 보완합니다.

앱이 백그라운드에 있는 동안 다운로드가 완료되면, FileExplore 화면으로 돌아왔을 때 열기 제안 창을 표시합니다.

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
- `blob:` URL 다운로드는 지원하지 않습니다. FileServer의 일반 HTTP/HTTPS 다운로드 URL은 지원합니다.
- 다운로드는 앱 프로세스에서 실행되므로 운영체제가 앱을 강제 종료하면 진행 중인 대용량 다운로드가 중단될 수 있습니다.
- 파일 형식에 대응하는 앱이 설치되어 있지 않으면 파일 열기는 수행할 수 없지만, 파일 자체는 `Downloads`에 남습니다.
