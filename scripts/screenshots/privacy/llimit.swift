
@main struct Capture {
    @MainActor static func main() throws {
        let now = Date(timeIntervalSince1970: 1_793_181_600)
        let entry = QuotaEntry(date: now,
            storedSnapshot: .loaded(SampleSnapshotFactory.make(now: now)),
            history: SampleSnapshotFactory.makeHistory(now: now), refreshIntervalMinutes: 30,
            storedSettings: .loaded(SampleSnapshotFactory.makeSettings()))
        let dashboard = MediumCompactQuotaView(entry: entry)
            .padding(14).frame(width: 420, height: 220)
            .background(FancyWidgetBackground(baseColor: nil))
            .preferredColorScheme(.dark)
        try captureView(NSHostingView(rootView: dashboard.environment(\.colorScheme, .dark)), size: NSSize(width: 420, height: 220),
            to: CommandLine.arguments[1], title: "LLimit")
    }
}
