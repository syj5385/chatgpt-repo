import SwiftUI

@main
struct FileExploreIOSApp: App {
    @StateObject private var model = FileExploreModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
    }
}
