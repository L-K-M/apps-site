import AppKit
import SwiftUI

// The real views and model run against disposable profiles and a fake process launcher.
// No Claude/ChatGPT executable, account store, or process discovery is used.
final class DemoProcess: ClaudeProcessHandle, @unchecked Sendable {
    let processIdentifier: Int32 = 4242
    let isRunning = true
    let dataDirectory: URL?
    var terminationHandler: (@Sendable () -> Void)?
    init(directory: URL?) { dataDirectory = directory }
    func terminate() {}
    func sendTerminationSignal() {}
    func terminateForcefully() {}
}
struct DemoLauncher: ClaudeLauncher {
    let running: [ManagedApp: [DemoProcess]]
    func launch(app: ManagedApp, executable: URL, location: ClaudeInstanceLocation) throws -> any ClaudeProcessHandle {
        fatalError("Screenshot fixtures must never launch an app")
    }
    func runningHandles(app: ManagedApp, executable: URL) -> [any ClaudeProcessHandle] { running[app] ?? [] }
    @MainActor func activate(handle: any ClaudeProcessHandle) {}
}

@main
struct Capture {
    @MainActor static func main() throws {
        let root = URL(fileURLWithPath: "/tmp/Claude-Replicant-Demo")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let profilesRoot = root.appendingPathComponent("Profiles")
        let store = ProfileStore(fileURL: root.appendingPathComponent("profiles.json"))
        var profiles = [
            ClaudeProfile(label: "Writing Studio", dataDirectory: profilesRoot.appendingPathComponent("writing-studio")),
            ClaudeProfile(label: "Sample Research", dataDirectory: profilesRoot.appendingPathComponent("sample-research")),
            ClaudeProfile(label: "Demo Workspace", app: .chatGPT, dataDirectory: profilesRoot.appendingPathComponent("demo-workspace")),
            ClaudeProfile(label: "Test Projects", app: .chatGPT, dataDirectory: profilesRoot.appendingPathComponent("test-projects"))
        ]
        for (index, color) in [ProfileColor.teal, .orange, .blue, .purple].enumerated() { profiles[index].color = color }
        try store.save(profiles)
        func bundle(_ name: String, id: String) throws -> URL {
            let url = root.appendingPathComponent(name + ".app")
            try FileManager.default.createDirectory(at: url.appendingPathComponent("Contents/MacOS"), withIntermediateDirectories: true)
            let data = try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": id], format: .xml, options: 0)
            try data.write(to: url.appendingPathComponent("Contents/Info.plist"))
            return url
        }
        let claude = try bundle("Claude", id: "com.anthropic.claudefordesktop")
        let chatGPT = try bundle("ChatGPT", id: "com.openai.codex")
        let defaults = UserDefaults(suiteName: "cabinet.synthetic.claude-replicant")!
        defaults.removePersistentDomain(forName: "cabinet.synthetic.claude-replicant")
        let launcher = DemoLauncher(running: [.claude: [DemoProcess(directory: profiles[0].dataDirectory)], .chatGPT: [DemoProcess(directory: profiles[2].dataDirectory)]])
        let manager = ProfileManager(store: store, launcher: launcher, claudeBundleURL: claude, chatGPTBundleURL: chatGPT, defaults: defaults, dataRootDirectory: profilesRoot)
        manager.load()
        try captureSwiftUI(ContentView(manager: manager), width: 760, height: 410, to: CommandLine.arguments[1], title: "Claude Replicant")
        defaults.removePersistentDomain(forName: "cabinet.synthetic.claude-replicant")
    }
}
