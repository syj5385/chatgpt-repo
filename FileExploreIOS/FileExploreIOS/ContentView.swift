import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: FileExploreModel
    @State private var showingServerSheet = false
    @State private var reloadToken = UUID()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(model.pageTitle)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                Button {
                    reloadToken = UUID()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .frame(width: 32, height: 32)
                }
                Button {
                    showingServerSheet = true
                } label: {
                    Image(systemName: "server.rack")
                        .frame(width: 32, height: 32)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.bar)

            if model.isLoading {
                ProgressView()
                    .progressViewStyle(.linear)
            }

            Group {
                if let url = model.activeURL {
                    FileWebView(url: url, reloadToken: reloadToken)
                        .environmentObject(model)
                } else {
                    ContentUnavailableView("서버 주소 필요", systemImage: "server.rack")
                }
            }
        }
        .sheet(isPresented: $showingServerSheet) {
            VStack(spacing: 16) {
                Text("FileExplore 서버")
                    .font(.title2.bold())
                TextField("https://server.example.com", text: $model.serverURLText)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Button("취소") {
                        showingServerSheet = false
                    }
                    Spacer()
                    Button("연결") {
                        model.connect()
                        showingServerSheet = false
                    }
                    .buttonStyle(.borderedProminent)
                }
                Spacer()
            }
            .padding(20)
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
