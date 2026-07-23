import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: FileExploreModel
    @State private var showingServerSheet = false
    @State private var reloadToken = UUID()

    var body: some View {
        NavigationStack {
            Group {
                if let url = model.activeURL {
                    FileWebView(url: url, reloadToken: reloadToken)
                        .environmentObject(model)
                        .ignoresSafeArea(edges: .bottom)
                } else {
                    ContentUnavailableView("서버 주소 필요", systemImage: "server.rack")
                }
            }
            .navigationTitle(model.pageTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack {
                        Button {
                            reloadToken = UUID()
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        Button {
                            showingServerSheet = true
                        } label: {
                            Image(systemName: "server.rack")
                        }
                    }
                }
            }
            .overlay(alignment: .top) {
                if model.isLoading {
                    ProgressView()
                        .progressViewStyle(.linear)
                }
            }
        }
        .sheet(isPresented: $showingServerSheet) {
            NavigationStack {
                Form {
                    TextField("https://server.example.com", text: $model.serverURLText)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                }
                .navigationTitle("FileExplore 서버")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("취소") { showingServerSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("연결") {
                            model.connect()
                            showingServerSheet = false
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: Binding(
            get: { model.shareURL != nil },
            set: { if !$0 { model.shareURL = nil } }
        )) {
            if let url = model.shareURL {
                ActivityView(items: [url])
            }
        }
        .alert("오류", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("확인", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "알 수 없는 오류")
        }
    }
}
