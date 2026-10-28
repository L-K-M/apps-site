import AppKit

// A no-op stand-in avoids starting the highlighter or reading active windows.
final class FocusHighlighter {
    static let shared = FocusHighlighter()
    static let hotkeyRegistrationDidChange = Notification.Name("DemoHotkeyChanged")
    let hotkeyRegistrationFailed = false
    func suspendHotkeyForRecording() {}
    func resumeHotkeyAfterRecording() {}
}
let demoDefaults = UserDefaults(suiteName: "cabinet.synthetic.alan")!

@main
struct Capture {
    @MainActor static func main() throws {
        _ = NSApplication.shared
        demoDefaults.removePersistentDomain(forName: "cabinet.synthetic.alan")
        demoDefaults.set(4.0, forKey: Key.width)
        demoDefaults.set(12.0, forKey: Key.cornerRadius)
        demoDefaults.setColor(.systemPurple, forKey: Key.lightMode)
        demoDefaults.set(true, forKey: Key.glowingBorder)
        let content = BorderPreviewView(frame: NSRect(x: 0, y: 0, width: 520, height: 260))
        if #available(macOS 14.4, *) {
            try captureOwnView(content, size: content.bounds.size, to: CommandLine.arguments[1], title: "Alan Settings")
        }
        demoDefaults.removePersistentDomain(forName: "cabinet.synthetic.alan")
    }
}
