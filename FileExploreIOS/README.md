# FileExplore iOS

`FileServer` 웹 화면을 iPhone과 iPad에서 사용하는 SwiftUI + WKWebView 클라이언트입니다. 서버 구현은 변경하지 않습니다.

## 기능

- 기본 서버: `https://58.232.206.129:5443`
- 앱에서 서버 주소 변경 및 저장
- WKWebView 쿠키 기반 로그인 세션 유지
- 웹 파일 업로드 지원
- HTTP Basic/Digest 인증 입력
- 자체 서명 인증서 경고 및 현재 앱 실행 동안 동일 호스트·동일 인증서만 허용
- WKDownload를 통한 파일 다운로드
- 앱 Documents/FileExplore 폴더에 중복되지 않는 이름으로 저장
- 다운로드 완료 직후 iOS 공유 시트 표시
- Files 앱의 FileExplore 영역을 통한 저장 파일 접근

## 프로젝트 생성

프로젝트는 XcodeGen 설정을 사용합니다.

```bash
brew install xcodegen
cd FileExploreIOS
xcodegen generate
open FileExploreIOS.xcodeproj
```

## 실행

1. Xcode에서 개발자 Team과 Signing을 선택합니다.
2. iPhone 또는 iPad를 연결하거나 Simulator를 선택합니다.
3. `FileExploreIOS` scheme을 실행합니다.
4. 자체 서명 인증서 경고가 나타나면 서버와 인증서를 확인한 후 계속합니다.

## 배포 참고

- 실제 iPhone 설치용 IPA는 Apple Developer 서명과 provisioning profile이 필요합니다.
- GitHub Actions는 코드 서명 없이 iOS Simulator용 빌드를 검증합니다.
- App Store 배포 전에는 `NSAllowsArbitraryLoads`를 제거하고 신뢰 가능한 HTTPS 인증서 및 필요한 도메인 예외만 사용하는 것을 권장합니다.
