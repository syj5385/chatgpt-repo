import SwiftUI
import WebKit
import Security
import UIKit

struct FileWebView: UIViewRepresentable {
    let url: URL
    let reloadToken: UUID

    @EnvironmentObject private var model: FileExploreModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model, initialURL: url, reloadToken: reloadToken)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = "FileExploreIOS/1.0"
        context.coordinator.webView = webView
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.currentURL != url {
            context.coordinator.currentURL = url
            context.coordinator.clearAcceptedCertificate()
            webView.load(URLRequest(url: url))
        } else if context.coordinator.reloadToken != reloadToken {
            context.coordinator.reloadToken = reloadToken
            webView.reload()
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        private let model: FileExploreModel
        fileprivate weak var webView: WKWebView?
        fileprivate var currentURL: URL
        fileprivate var reloadToken: UUID

        private var acceptedHost: String?
        private var acceptedCertificateData: Data?
        private var downloadDestinations: [ObjectIdentifier: URL] = [:]

        init(model: FileExploreModel, initialURL: URL, reloadToken: UUID) {
            self.model = model
            currentURL = initialURL
            self.reloadToken = reloadToken
        }

        fileprivate func clearAcceptedCertificate() {
            acceptedHost = nil
            acceptedCertificateData = nil
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
            Task { @MainActor in model.isLoading = true }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            Task { @MainActor in
                model.isLoading = false
                model.pageTitle = webView.title?.isEmpty == false ? webView.title! : (webView.url?.host ?? "FileExplore")
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
            report(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
            report(error)
        }

        private func report(_ error: Error) {
            Task { @MainActor in
                model.isLoading = false
                model.errorMessage = error.localizedDescription
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            preferences: WKWebpagePreferences,
            decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void
        ) {
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download, preferences)
            } else {
                decisionHandler(.allow, preferences)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            let disposition = (navigationResponse.response as? HTTPURLResponse)?
                .value(forHTTPHeaderField: "Content-Disposition")?
                .lowercased() ?? ""
            if disposition.contains("attachment") || !navigationResponse.canShowMIMEType {
                decisionHandler(.download)
            } else {
                decisionHandler(.allow)
            }
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            do {
                let destination = try uniqueDownloadURL(fileName: sanitized(suggestedFilename))
                downloadDestinations[ObjectIdentifier(download)] = destination
                completionHandler(destination)
            } catch {
                completionHandler(nil)
                report(error)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let destination = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
            Task { @MainActor in
                model.shareURL = destination
            }
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
            report(error)
        }

        private func uniqueDownloadURL(fileName: String) throws -> URL {
            let fileManager = FileManager.default
            let documents = try fileManager.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            let directory = documents.appendingPathComponent("FileExplore", isDirectory: true)
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

            let extensionPart = (fileName as NSString).pathExtension
            let basePart = (fileName as NSString).deletingPathExtension
            var candidate = directory.appendingPathComponent(fileName)
            var suffix = 1
            while fileManager.fileExists(atPath: candidate.path) {
                let nextName = extensionPart.isEmpty
                    ? "\(basePart) (\(suffix))"
                    : "\(basePart) (\(suffix)).\(extensionPart)"
                candidate = directory.appendingPathComponent(nextName)
                suffix += 1
            }
            return candidate
        }

        private func sanitized(_ name: String) -> String {
            let invalid = CharacterSet(charactersIn: "/\\:\0")
            let cleaned = name.components(separatedBy: invalid).joined(separator: "_")
            return cleaned.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "download" : cleaned
        }

        func webView(
            _ webView: WKWebView,
            didReceive challenge: URLAuthenticationChallenge,
            completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
        ) {
            let method = challenge.protectionSpace.authenticationMethod
            if method == NSURLAuthenticationMethodServerTrust,
               let trust = challenge.protectionSpace.serverTrust {
                handleServerTrust(challenge: challenge, trust: trust, completionHandler: completionHandler)
                return
            }
            if method == NSURLAuthenticationMethodHTTPBasic || method == NSURLAuthenticationMethodHTTPDigest {
                presentCredentialsPrompt(challenge: challenge, completionHandler: completionHandler)
                return
            }
            completionHandler(.performDefaultHandling, nil)
        }

        private func handleServerTrust(
            challenge: URLAuthenticationChallenge,
            trust: SecTrust,
            completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
        ) {
            let host = challenge.protectionSpace.host
            let certificateData = leafCertificateData(trust)
            if host.caseInsensitiveCompare(acceptedHost ?? "") == .orderedSame,
               certificateData == acceptedCertificateData {
                completionHandler(.useCredential, URLCredential(trust: trust))
                return
            }

            SecTrustEvaluateAsyncWithError(trust, DispatchQueue.main) { [weak self] _, trusted, _ in
                guard let self else {
                    completionHandler(.cancelAuthenticationChallenge, nil)
                    return
                }
                if trusted {
                    completionHandler(.performDefaultHandling, nil)
                    return
                }
                self.presentCertificatePrompt(host: host) { accepted in
                    if accepted, let certificateData {
                        self.acceptedHost = host
                        self.acceptedCertificateData = certificateData
                        completionHandler(.useCredential, URLCredential(trust: trust))
                    } else {
                        completionHandler(.cancelAuthenticationChallenge, nil)
                    }
                }
            }
        }

        private func leafCertificateData(_ trust: SecTrust) -> Data? {
            guard let certificate = SecTrustGetCertificateAtIndex(trust, 0) else { return nil }
            return SecCertificateCopyData(certificate) as Data
        }

        private func presentCertificatePrompt(host: String, completion: @escaping (Bool) -> Void) {
            guard let presenter = topViewController() else {
                completion(false)
                return
            }
            let alert = UIAlertController(
                title: "인증서를 신뢰할 수 없음",
                message: "\(host) 서버의 인증서를 검증할 수 없습니다. 계속하면 이번 앱 실행 동안 동일한 서버와 인증서에만 연결합니다.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completion(false) })
            alert.addAction(UIAlertAction(title: "계속", style: .destructive) { _ in completion(true) })
            presenter.present(alert, animated: true)
        }

        private func presentCredentialsPrompt(
            challenge: URLAuthenticationChallenge,
            completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
        ) {
            guard let presenter = topViewController() else {
                completionHandler(.cancelAuthenticationChallenge, nil)
                return
            }
            let alert = UIAlertController(
                title: "서버 로그인",
                message: challenge.protectionSpace.host,
                preferredStyle: .alert
            )
            alert.addTextField { $0.placeholder = "사용자 이름" }
            alert.addTextField {
                $0.placeholder = "비밀번호"
                $0.isSecureTextEntry = true
            }
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in
                completionHandler(.cancelAuthenticationChallenge, nil)
            })
            alert.addAction(UIAlertAction(title: "로그인", style: .default) { _ in
                let user = alert.textFields?.first?.text ?? ""
                let password = alert.textFields?.last?.text ?? ""
                completionHandler(.useCredential, URLCredential(user: user, password: password, persistence: .forSession))
            })
            presenter.present(alert, animated: true)
        }

        private func topViewController() -> UIViewController? {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            var controller = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
            while let presented = controller?.presentedViewController {
                controller = presented
            }
            return controller
        }
    }
}
