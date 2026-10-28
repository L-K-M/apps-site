import SwiftUI
import AppKit

// Fixed display settings for an opaque standalone preview, without NSWorkspace.
final class AccessibilityDisplaySettings: ObservableObject {
    static let shared = AccessibilityDisplaySettings()
    let reduceTransparency = true
    let reduceMotion = true
    static func effectiveBackgroundOpacity(configured: Double, reduceTransparency: Bool) -> Double {
        reduceTransparency ? 1 : configured
    }
    static func effectiveAnimation(_ animation: Animation?, reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : animation
    }
}

@main struct Capture {
    @MainActor static func main() throws {
        let domain = "cabinet.synthetic.zap.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: domain)!
        defer { defaults.removePersistentDomain(forName: domain) }
        let login = LoginItemService(status: { .notRegistered }, register: {}, unregister: {}, openSettings: {})
        let preferences = Preferences(defaults: defaults, loginItemService: login)
        preferences.backgroundOpacity = 1
        let model = OverlayModel()
        let samples = [("Example Notes", "note.text"), ("Example Browser", "globe"), ("Example Music", "music.note")]
        model.apps = samples.enumerated().map { i, value in
            let image = NSImage(systemSymbolName: value.1, accessibilityDescription: value.0)?
                .withSymbolConfiguration(.init(paletteColors: [.white]))
            image?.isTemplate = false
            return AppInfo(bundleIdentifier: "example.demo.\(i)", name: value.0, processIdentifier: pid_t(i), icon: image)
        }
        model.selectedIndex = 0
        let view = OverlayView(model: model, preferences: preferences)
            .padding(24).frame(width: 420, height: 220)
        try captureSwiftUI(view, width: 420, height: 220, to: CommandLine.arguments[1], title: "Zap")
    }
}
