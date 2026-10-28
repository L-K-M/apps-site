import SwiftUI
import AppKit

@main struct Capture {
    @MainActor static func main() throws {
        let date = Date(timeIntervalSince1970: 1_793_181_600)
        let tabs: [SessionPreview.Tab] = [
            .init(id: "1", title: "Example project notes", url: "https://example.com/notes", spaceID: "work", pinned: true, essential: false),
            .init(id: "2", title: "Design reference library", url: "https://example.org/design", spaceID: "work", pinned: false, essential: false),
            .init(id: "3", title: "A guide to container gardening", url: "https://example.net/garden", spaceID: "reading", pinned: false, essential: false),
            .init(id: "4", title: "Weekend walking routes", url: "https://example.org/walks", spaceID: "reading", pinned: false, essential: false),
            .init(id: "5", title: "Sample documentation", url: "https://example.com/docs", spaceID: "work", pinned: false, essential: true)
        ]
        let preview = SessionPreview(format: .zen, tabs: tabs, spaces: [
            .init(id: "work", name: "Projects", icon: ""), .init(id: "reading", name: "Reading", icon: "")
        ], folderCount: 2, splitCount: 0, collectedAt: date)
        let record = BackupRecord(file: URL(fileURLWithPath: "/synthetic/zen-sessions/session-2026-10-28.jsonlz4"),
            modifiedAt: date, bytes: 185_344, kind: .automatic, preview: preview, digest: "synthetic", problem: nil)
        try captureSwiftUI(BackupDetail(backup: record, current: nil, restore: {}).background(Color(nsColor: .windowBackgroundColor)), width: 1024, height: 680,
            to: CommandLine.arguments[1], title: "Zen Backup Manager")
    }
}
