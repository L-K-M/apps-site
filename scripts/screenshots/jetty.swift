import AppKit
import SwiftUI
@main struct Capture {
    @MainActor static func main() throws {
        let domain = "org.example.cabinet.capture.jetty"
        let defaults = UserDefaults(suiteName: domain)!
        defaults.removePersistentDomain(forName: domain)
        let preferences = Preferences(defaults: defaults)
        try captureSwiftUI(AppearanceView(preferences: preferences), width: 740, height: 860,
                           to: CommandLine.arguments[1], title: "Jetty")
    }
}
