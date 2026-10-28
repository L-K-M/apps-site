import SwiftUI
import AppKit

// This capture model has no store, exporter, web view or network client.
final class LibraryModel: ObservableObject {
    struct Preferences { let installDirectory = URL(fileURLWithPath: "/Applications") }
    let preferences = Preferences()
    func createWrap(from address: String, name: String?) {}
}

@main struct Capture {
    @MainActor static func main() throws {
        try captureSwiftUI(NewWrapView(model: LibraryModel()).background(Color(nsColor: .windowBackgroundColor)), width: 480, height: 350,
            to: CommandLine.arguments[1], title: "Wrapybara")
    }
}
