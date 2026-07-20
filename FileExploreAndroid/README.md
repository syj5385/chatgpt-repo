# FileExplore Android

`FileServer` 웹 화면을 Android WebView로 사용하는 전용 클라이언트입니다. 서버는 변경하지 않고, 앱에서 서버 주소만 설정해 접속합니다.

## 주요 기능

- 첫 실행 시 FileExplore 서버 주소 저장
- JavaScript, DOM Storage, 쿠키 및 로그인 세션 유지
- 파일 선택 및 여러 파일 업로드
- 로그인 쿠키를 전달하는 앱 내 직접 다운로드
- 자체 서명 인증서를 사용자가 승인한 경우 동일 호스트·동일 인증서에 한해 다운로드 연결 허용
- Android 10 이상에서 MediaStore를 사용해 공용 `Downloads` 폴더에 저장
- Android 8~9에서만 기존 저장소 권한 요청
- HTTP Basic Auth 입력창
- 새로고침, 서버 주소 변경, WebView 방문 기록 기반 뒤로가기
- 스마트폰, 태블릿, 폴더블에서 회전/리사이즈 가능한 단일 화면

## 기본 서버 주소

```text
https://58.232.206.129:5443
```

상단의 서버 버튼에서 주소를 변경할 수 있습니다. 스킴을 생략하면 `https://`가 자동으로 붙습니다.

## 자체 서명 인증서와 다운로드

`FileServer`가 자체 서명 인증서를 사용하면 앱에서 경고가 표시됩니다. 사용자가 계속을 선택하면 앱은 해당 실행 동안 승인한 호스트와 인증서 바이트를 함께 기억합니다.

파일 다운로드는 Android 시스템 DownloadManager에 위임하지 않고 앱이 직접 수행합니다. 따라서 WebView에서 승인한 동일 인증서를 다운로드 요청에도 제한적으로 적용할 수 있습니다. 인증서가 바뀌거나 다른 호스트로 이동하면 해당 예외는 적용되지 않습니다.

공인 인증서 또는 Android에 설치된 신뢰 인증서를 사용하는 것이 가장 안전한 구성입니다.

## 다운로드 오류 구분

앱은 다운로드 결과를 다음처럼 구분해 표시합니다.

- 다운로드 완료
- TLS 인증서 확인 실패
- 로그인 세션 만료 또는 접근 권한 없음
- HTTP 상태 오류
- 네트워크 또는 파일 저장 오류
- 잘못되거나 반복되는 리디렉션

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
- `blob:` URL 다운로드는 지원하지 않습니다. FileServer의 일반 HTTP/HTTPS `/files/` URL은 지원합니다.
- 다운로드는 앱 프로세스의 백그라운드 실행기를 사용합니다. 대용량 파일 다운로드 중 시스템이 앱 프로세스를 강제로 종료하면 다운로드가 중단될 수 있습니다.
