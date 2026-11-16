import AppKit
import SwiftUI

// Renders DeviceControlDoctor's real MainView with invented watch-list models.
// DoctorStore is compiled from the app source with its init/load/save and
// process-inventory helpers neutralised by capture-new-mac-utilities.py; this
// harness never calls a refresh, discovery, permission query, reset or store.
@main
struct Capture {
    @MainActor
    static func main() throws {
        let model = DoctorStore()
        model.apps = Self.fixtureApps()
        model.events = Self.fixtureEvents(model.apps)
        model.selectedID = model.apps.first?.id
        model.monitorEnabled = false
        model.launchAtLogin = false
        model.queryAvailable = nil
        model.notice = nil
        let root = MainView()
            .environmentObject(model)
            .frame(width: 1180, height: 760)
        try captureSwiftUI(root, width: 1180, height: 760,
                            to: CommandLine.arguments[1], title: "DeviceControlDoctor")
    }

    private static let past = Date(timeIntervalSince1970: 1760000000)

    private static func fixtureApps() -> [WatchedApp] {
        var notes = WatchedApp(name: "Example Notes", bundleID: "com.example.notes",
                               path: "/Applications/Example Notes.app", version: "3.2.1")
        notes.expectedServices = [.accessibility]
        notes.readings = [
            PermissionReading(service: .accessibility,
                              result: AuthorizationResult(state: .granted, detail: "A record is present for this bundle identifier."),
                              checkedAt: past),
            PermissionReading(service: .postEvent,
                              result: AuthorizationResult(state: .unknown, detail: "Not checked in this capture."),
                              checkedAt: past),
            PermissionReading(service: .listenEvent,
                              result: AuthorizationResult(state: .unknown, detail: "Not checked in this capture."),
                              checkedAt: past),
        ]
        notes.identity = AppIdentity()
        notes.identity.signingIdentifier = "com.example.notes"
        notes.identity.teamIdentifier = "EXAMPLE123"
        notes.identity.requirement = "identifier \"com.example.notes\" and anchor apple generic"
        notes.identity.signatureValid = true
        notes.identity.signatureDetail = "Valid on disk"
        notes.functionalTest = FunctionalTest(outcome: .passed,
                                               note: "Manual accessibility test: the window was moved.",
                                               appPath: notes.path, appVersion: notes.version,
                                               recordedAt: past)
        notes.lastKnownWorking = past

        var typewriter = WatchedApp(name: "Sample Typewriter", bundleID: "com.example.typewriter",
                                    path: "/Applications/Sample Typewriter.app", version: "1.0.4")
        typewriter.expectedServices = [.postEvent]
        typewriter.readings = [
            PermissionReading(service: .postEvent,
                              result: AuthorizationResult(state: .denied,
                                                          detail: "The record reports a denied decision for the expected service."),
                              checkedAt: past),
        ]

        var player = WatchedApp(name: "Fixture Player", bundleID: "com.example.player",
                                path: "/Applications/Fixture Player.app", version: "0.9.0")
        player.expectedServices = [.listenEvent]
        player.readings = [
            PermissionReading(service: .listenEvent,
                              result: AuthorizationResult(state: .unavailable,
                                                          detail: "Permission listing is unavailable on this configuration."),
                              checkedAt: past),
        ]
        return [notes, typewriter, player]
    }

    private static func fixtureEvents(_ apps: [WatchedApp]) -> [DoctorEvent] {
        guard let notes = apps.first(where: { $0.name == "Example Notes" }),
              let typewriter = apps.first(where: { $0.name == "Sample Typewriter" }) else { return [] }
        return [
            DoctorEvent(appID: notes.id, appName: notes.name, message: "Added to watch list. Expected permissions can be adjusted for this app."),
            DoctorEvent(appID: notes.id, appName: notes.name, message: "User-confirmed functional test: passed. Manual accessibility test: the window was moved."),
            DoctorEvent(appID: typewriter.id, appName: typewriter.name, message: "Event generation: Granted → Denied."),
        ]
    }
}
