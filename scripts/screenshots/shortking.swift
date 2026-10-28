import AppKit
import SwiftUI
import ShortkingKit

@main
struct Capture {
    @MainActor static func main() throws {
        let directory = URL(fileURLWithPath: "/tmp/Cabinet-Shortking-Demo")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        StoreLocation.directory = directory
        let state = AppState()
        let bindings: [(String, Modifiers, String, String, ClaimLayer)] = [
            ("n", [.command], "Sample Notes", "New note", .appMenu),
            ("s", [.command], "Sample Notes", "Save document", .appMenu),
            ("g", [.command, .shift], "Demo Launcher", "Open launcher", .windowServer),
            ("g", [.command, .shift], "Sample Notes", "Go to collection", .appMenu),
            ("f", [.command], "Example Browser", "Find on page", .appMenu),
            ("p", [.command, .shift], "Demo Studio", "Command palette", .appMenu),
            ("r", [.command, .option], "Demo Studio", "Run preview", .appMenu),
            ("k", [.command, .option], "Example Browser", "Search bookmarks", .windowServer)
        ]
        let claims = bindings.map { key, modifiers, owner, label, layer in
            Claim(combo: KeyCombo(character: key, modifiers: modifiers), layer: layer, status: .known,
                  owner: Owner(name: owner, bundleID: "org.example." + owner.replacingOccurrences(of: " ", with: "")), label: label)
        }
        let groups = ConflictAnalyzer.analyze(ClaimMerger.group(claims))
        state.result = ScanResult(claims: claims, groups: groups, conflicts: ConflictAnalyzer.conflicts(in: groups))
        state.destination = .inventory
        state.selectedComboKey = KeyCombo(character: "g", modifiers: [.command, .shift]).groupingKey
        state.settings.hasCompletedOnboarding = true
        if #available(macOS 14.4, *) {
            let view = NSHostingView(rootView: RootView().environmentObject(state).frame(width: 1160, height: 640))
            try captureOwnView(view, size: NSSize(width: 1160, height: 640), to: CommandLine.arguments[1], title: "Shortking")
        }
    }
}
