import SwiftUI
import MurtenCore
import MurtenModuleKit

// Renders MurtenUtilities' real HomeView. The shell sources are compiled with
// this harness, so the internal home view is used directly and AppModel.start()
// is never called: no watcher, service, scanner or store runs. The ten module
// descriptors come from the real ModuleRegistry; the providers are inert stubs
// so the tiles render in their available state without building or starting any
// module.
@main
struct Capture {
    @MainActor
    static func main() throws {
        let services = ShellServices(
            settings: CaptureSettingsStore(),
            suggestionPersistence: CaptureSuggestionPersistence(),
            notifier: CaptureNotifier(),
            environment: CaptureEnvironment(),
            launchAtLogin: CaptureLoginItem(),
            wake: CaptureWake(),
            updates: CaptureUpdates(),
            clock: CaptureClock(),
            currentVersion: nil,
            moduleDefaults: Capture.volatileDefaults,
            stateDefaults: Capture.volatileDefaults("suite-state"))
        let factories = ModuleRegistry.all.map { module in
            ModuleFactory(moduleID: module.id) { _ in CaptureProvider(moduleID: module.id) }
        }
        let model = AppModel(factories: factories, services: services)
        let root = HomeView(model: model)
            .frame(width: 1280, height: 500)
        try captureSwiftUI(root, width: 1280, height: 500,
                            to: CommandLine.arguments[1], title: "Murten Utilities")
    }

    /// An isolated defaults suite that is removed again, so the capture leaves
    /// no persisted preferences behind.
    private static func volatileDefaults(_ name: String = UUID().uuidString) -> UserDefaults {
        let suite = "cabinet.capture.murten.\(name)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

final class CaptureProvider: SuiteModuleProvider {
    let moduleID: String
    init(moduleID: String) { self.moduleID = moduleID }
    func makePane(route: ModuleRoute?) -> AnyView {
        AnyView(Text("Module panes are not part of this capture.").foregroundStyle(.secondary))
    }
}

struct CaptureSettingsStore: SettingsPersisting {
    func load() -> SuiteSettings { SuiteSettings() }
    func save(_ settings: SuiteSettings) {}
}

struct CaptureSuggestionPersistence: SuggestionPersisting {
    func load() throws -> SuggestionLedger? { nil }
    func save(_ ledger: SuggestionLedger) throws {}
    func quarantine() throws -> URL? { nil }
}

@MainActor
final class CaptureNotifier: SuggestionNotifying {
    var onOpen: ((URL) -> Void)?
    func requestAuthorization() async -> NotificationAuthorization { .unsupported }
    func deliver(_ suggestion: Suggestion, moduleName: String) {}
    func withdraw(modules moduleIDs: Set<String>) {}
    func withdraw(suggestions keys: Set<SuggestionKey>) {}
}

struct CaptureEnvironment: WatchEnvironmentSampling {
    func sample() async -> WatchEnvironment {
        WatchEnvironment(powerSource: .adapter, lowPowerModeEnabled: false,
                         networkCost: .unrestricted, minuteOfDay: 600)
    }
}

@MainActor
struct CaptureLoginItem: LaunchAtLoginControlling {
    var status: LaunchAtLoginStatus { .unsupported }
    func apply(_ request: LaunchAtLoginRequest) throws {}
}

@MainActor
final class CaptureWake: SystemWakeObserving {
    func observeWake(_ handler: @escaping @MainActor () -> Void) {}
}

struct CaptureUpdates: SuiteUpdateChecking {
    func latestRelease() async throws -> SuiteRelease { throw CocoaError(.fileNoSuchFile) }
}

struct CaptureClock: WatchClock {
    func now() -> Date { Date(timeIntervalSince1970: 1760000000) }
    func sleep(until deadline: Date) async throws { throw CancellationError() }
}
