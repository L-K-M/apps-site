import SwiftUI
import AppKit

// Pure stand-ins for view state: no icon store, directory watcher or app enumeration.
enum IconSourceMode { static let isSquircleJailed = true }
struct IconTargetRow: Identifiable { let id: String; let name: String }
struct CaptureIconSet: Identifiable { let id: String; let name: String }
final class CaptureIconLibrary { let records: [String] = [] }
final class IconEditorModel: ObservableObject {
    let filteredRows = ["Sample Notes", "Sample Calendar", "Sample Browser", "Sample Music", "Sample Files"].enumerated().map {
        IconTargetRow(id: "sample-\($0.offset)", name: $0.element)
    }
    @Published var selection: String? = "sample-0"
    @Published var search = ""
    @Published var dropTarget: String?
    @Published var searchingRow: IconTargetRow?
    @Published var browsingWebRow: IconTargetRow?
    @Published var managingSets = false
    let iconSets = CaptureIconLibrary()
    let applyingSet: CaptureIconSet? = nil
    let applyProgress = (done: 0, total: 0)
    let applySummary: String? = nil
    let installedSets: [CaptureIconSet] = []
    func reload() {}
    func icon(for row: IconTargetRow) -> NSImage? {
        let names = ["note.text", "calendar", "globe", "music.note", "folder"]
        return NSImage(systemSymbolName: names[Int(row.id.suffix(1)) ?? 0], accessibilityDescription: nil)
    }
    func status(for row: IconTargetRow) -> String { row.id == "sample-0" ? "Custom icon · set in Pict" : "Original artwork" }
    func hasOverride(_ row: IconTargetRow) -> Bool { row.id == "sample-0" }
    func isPinnedToSystemIcon(_ row: IconTargetRow) -> Bool { false }
    func chooseFile(for row: IconTargetRow) {}
    func useOriginalArtwork(for row: IconTargetRow) {}
    func useSystemIcon(for row: IconTargetRow) {}
    func adopt(_ url: URL, for row: IconTargetRow) -> Bool { false }
    func resetAll() {}
    func applyMatching(from iconSet: CaptureIconSet) {}
}

@main struct Capture {
    @MainActor static func main() throws {
        try captureSwiftUI(IconsView(model: IconEditorModel()).frame(width: 800, height: 480), width: 800, height: 480,
            to: CommandLine.arguments[1], title: "Pict")
    }
}
