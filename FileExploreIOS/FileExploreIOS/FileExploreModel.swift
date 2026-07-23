import Foundation

@MainActor
final class FileExploreModel: ObservableObject {
    @Published var serverURLText: String
    @Published var activeURL: URL?
    @Published var isLoading = false
    @Published var pageTitle = "FileExplore"
    @Published var errorMessage: String?
    @Published var shareURL: URL?

    private let serverURLKey = "fileexplore.serverURL"
    private let defaultServerURL = "https://58.232.206.129:5443"

    init() {
        let saved = UserDefaults.standard.string(forKey: serverURLKey) ?? defaultServerURL
        serverURLText = saved
        activeURL = Self.normalizedURL(from: saved)
    }

    func connect() {
        guard let url = Self.normalizedURL(from: serverURLText) else {
            errorMessage = "올바른 HTTP 또는 HTTPS 서버 주소를 입력해 주세요."
            return
        }
        serverURLText = url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        UserDefaults.standard.set(serverURLText, forKey: serverURLKey)
        activeURL = url
    }

    static func normalizedURL(from raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let value = trimmed.lowercased().hasPrefix("http://") || trimmed.lowercased().hasPrefix("https://")
            ? trimmed
            : "https://\(trimmed)"
        guard let url = URL(string: value), let scheme = url.scheme?.lowercased(),
              (scheme == "http" || scheme == "https"), url.host != nil else { return nil }
        return url
    }
}
