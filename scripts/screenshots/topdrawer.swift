import AppKit
import SwiftUI
private struct NoLoginItem: LoginItemManaging {
    func isEnabled() -> Bool? { false }
    func setEnabled(_ enabled: Bool) -> String? { nil }
}
@main struct Capture {
    @MainActor static func main() throws {
        let domain = "org.example.cabinet.capture.topdrawer"
        let defaults = UserDefaults(suiteName: domain)!
        defaults.removePersistentDomain(forName: domain)
        let preferences = Preferences(defaults: defaults, loginItem: NoLoginItem())
        try captureSwiftUI(AppearanceView(preferences: preferences), width: 720, height: 900,
                           to: CommandLine.arguments[1], title: "Top Drawer")
    }
}
