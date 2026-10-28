import SwiftUI
import AppKit

@main struct Capture {
    @MainActor static func main() throws {
        let model = QuickSearchModel()
        let secret = Array("12345678901234567890".utf8) // RFC 4226 test vector, never a real account.
        model.setEntries(["Example Mail", "Example Code", "Example Cloud", "Example Games"].enumerated().map { i, issuer in
            AuthEntry(id: "demo-\(i)", kind: .totp, issuer: issuer, account: "demo@example.com", secret: secret,
                      algorithm: .sha1, digits: 6, period: 30, pinned: i == 0)
        })
        model.tick = Date(timeIntervalSince1970: 1_700_000_010)
        model.showCodes = true
        try captureSwiftUI(QuickSearchView(model: model, onCommit: { _ in }), width: 560,
            height: QuickSearchMetrics.panelHeight(forRows: model.results.count),
            to: CommandLine.arguments[1], title: "Gans")
    }
}
