# FileExplore Android

`FileServer/` 웹 파일 탐색기를 안드로이드 앱 내부 WebView에서 사용하는 전용 클라이언트입니다.

## 기능

- 최초 실행 시 FileServer 주소 설정
- 로그인 쿠키와 자동 로그인 세션 유지
- 파일 업로드용 Android 파일 선택기
- 파일 다운로드를 Android 다운로드 관리자에 전달
- 새로고침, 웹 탐색 뒤로가기, 오류 화면과 재시도
- FileServer와 다른 호스트의 링크는 외부 브라우저로 분리
- 자체 서명 인증서를 자동으로 우회하지 않고, 사용자가 해당 실행에서 명시적으로 허용
- 스마트폰, 태블릿, 폴더블의 화면 크기에 맞춰 WebView 자동 확장

## 권장 서버 주소

FileServer README의 기본 LAN HTTPS 예시는 다음 형식입니다.

```text
https://192.168.0.20:5443
```

실제 FileServer가 실행되는 컴퓨터의 IP 주소로 바꾸어 입력해야 합니다. 안드로이드 기기와 서버 컴퓨터는 서로 접근 가능한 네트워크에 있어야 합니다.

## 빌드 환경

- Android Studio Quail 2 또는 AGP 9.3을 지원하는 버전
- JDK 17
- Android SDK Platform 37
- Android SDK Build Tools 36.0.0
- Gradle 9.5.0

Android Studio에서 `FileServerAndroid` 폴더를 프로젝트로 열고 SDK 설치 안내를 따른 뒤 실행합니다.

명령줄에서는 Gradle 9.5.0이 설치된 환경에서 다음 명령을 사용합니다.

```bash
cd FileServerAndroid
gradle :app:assembleDebug
```

생성 APK:

```text
app/build/outputs/apk/debug/app-debug.apk
```

GitHub Actions의 `Build FileExplore Android` 워크플로도 Debug APK를 artifact로 생성합니다.

## 인증서 주의사항

FileServer가 자동 생성한 self-signed 인증서를 사용하는 경우 앱에서 인증서 경고가 표시됩니다. 앱은 인증서 오류를 기본적으로 차단하며, 사용자가 `이번 실행에서 계속`을 선택한 호스트만 앱이 종료될 때까지 임시 허용합니다.

실제 인터넷을 통해 접속할 때는 self-signed 인증서 대신 신뢰되는 인증기관의 인증서를 사용하세요. Android 다운로드 관리자는 앱의 임시 인증서 허용을 공유하지 않으므로, self-signed 인증서에서는 일반 파일 다운로드가 실패할 수 있습니다.

## 보안 동작

- JavaScript와 DOM Storage는 FileServer UI를 위해 활성화합니다.
- 로컬 파일 URL 접근은 차단합니다.
- HTTPS 페이지에서 HTTP 리소스를 섞어 불러오는 mixed content는 차단합니다.
- 제3자 쿠키는 차단합니다.
- 서버 주소는 앱 내부 저장소의 SharedPreferences에 저장합니다.
