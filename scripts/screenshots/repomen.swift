import AppKit
import SwiftUI

@main
struct Capture {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        application.appearance = NSAppearance(named: .aqua)
        let defaults = UserDefaults(suiteName: "org.example.cabinet.capture.repomen")!
        defaults.set([], forKey: "scanRoots")
        defaults.set([], forKey: "watchedFolders")
        defaults.set(false, forKey: "watchAutoTrash")
        defaults.set(false, forKey: "scanAtLaunch")
        let preferences = Preferences(defaults: defaults)
        let model = AppModel(preferences: preferences)
        model.loadCaptureItems()
        model.sidebarSelection = nil
        // Render the app's actual category list and artifact table directly.
        // The temporary host does not have a SwiftUI App scene to own the
        // navigation toolbar's safe area, so omit that shell for this capture.
        let root = HStack(spacing: 0) {
            SidebarView().frame(width: 230)
            Divider()
            ItemTable()
        }
            .frame(width: 1240, height: 430)
            .environmentObject(model)
            .environmentObject(preferences)
            .environmentObject(SnapshotModel())
        try! captureSwiftUI(root.foregroundStyle(Color.primary), width: 1240, height: 430,
                            to: CommandLine.arguments[1], title: "RepoMen")
    }
}
