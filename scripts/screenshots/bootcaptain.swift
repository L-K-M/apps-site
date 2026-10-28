import AppKit
import SwiftUI
import BootCaptainCore

@main struct Capture {
    @MainActor static func main() throws {
        let model = ScanViewModel()
        let examples: [(String, Mechanism, HealthState, Tristate)] = [
            ("Atlas Sync", .launchAgent, .ok, .yes),
            ("Meadow Helper", .smAppServiceLoginItem, .ok, .yes),
            ("Orbit Indexer", .launchDaemon, .ok, .no),
            ("Old Sketchbook Updater", .launchAgent, .broken, .no),
            ("Garden Scheduler", .cron, .ok, .no),
            ("Archive Audio", .audioHALPlugin, .unknown, .no)
        ]
        model.items = examples.enumerated().map { index, item in
            StartupItem(id: "sample-\(index)", mechanism: item.1,
                        label: "org.example.\(index).helper", displayName: item.0,
                        domain: "gui/501", sourcePath: "/Library/LaunchAgents/org.example.\(index).plist",
                        recipe: LaunchRecipe(executablePath: "/Applications/\(item.0).app/Contents/MacOS/Helper"),
                        triggers: [.speculative],
                        state: StateAxes(configured: .yes, registered: .yes, authorized: .yes,
                                         override: .absentDefault, loaded: item.3, running: item.3),
                        trust: .developerIDNotarized, health: item.2,
                        attribution: ResolvedAttribution(vendorName: "Example Software", productName: item.0,
                                                         confidence: .high),
                        notes: ["Synthetic startup item for the app directory screenshot."])
        }
        model.selection = nil
        model.lastScan = Date(timeIntervalSince1970: 1793181600)
        try captureSwiftUI(ContentView().environmentObject(model)
            .environmentObject(HelperClient()).environmentObject(CleanupService()),
            width: 1120, height: 590, to: CommandLine.arguments[1], title: "BootCaptain")
    }
}
