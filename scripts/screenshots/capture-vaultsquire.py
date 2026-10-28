#!/usr/bin/env python3
"""Capture VaultSquire's real QuickSearchView with invented in-memory projections."""
from pathlib import Path
import subprocess, tempfile, sys
site = Path(__file__).resolve().parents[2]
repo = Path(sys.argv[1]).resolve()
out = site / 'catalogue/assets/vaultsquire.png'
with tempfile.TemporaryDirectory(prefix='vaultsquire-capture-') as d:
    work = Path(d)
    support = (repo/'VaultSquire/App/ApplicationCoordinator.swift').read_text().split('@MainActor\nprotocol QuickSearchDataSource')[0]
    support += (repo/'VaultSquire/App/AppModel.swift').read_text().split('@MainActor\nfinal class AppModel')[0].replace('import Combine','')
    (work/'Contracts.swift').write_text(support)
    model = repo/'VaultSquire/Features/QuickSearch/QuickSearchPanelModel.swift'
    (work/'QuickSearchPanelModel.swift').write_text('import Combine\n' + model.read_text())
    (work/'Capture.swift').write_text('''import AppKit
import SwiftUI
@main @MainActor enum Capture {
    static func main() throws {
        let account = AccountID(provider: .vaultwarden, rawValue: "synthetic-account")
        let scope = VaultSpaceID(account: account, scope: .personal)
        let names = ["Example Garden", "Example Workshop", "Example Library", "Example Observatory"]
        let rows = names.enumerated().map { i, name in
            VaultItemProjection(id: VaultItemID(space: scope, rawValue: "sample-\\(i)"),
                displayTitle: name, displaySubtitle: "demo@example.org", category: .login,
                username: "demo@example.org", websites: ["https://example.org"],
                groupingLabels: ["Sample vault"], capabilities: [.viewItems, .copySecret],
                cacheReference: ProviderCacheReference(scope: .wholeAccount(account), captureGeneration: SnapshotGeneration(rawValue: 1)))
        }
        let model = QuickSearchPanelModel()
        model.present(items: rows, isUnlocked: true, vaultTitles: [account: "Sample vault"], onOpen: nil)
        try captureSwiftUI(QuickSearchView(model: model, onDismiss: {}), width: 620, height: 366,
                          to: CommandLine.arguments[1], title: "VaultSquire")
    }
}
''')
    domain = ['ProviderIdentity','SessionState','ProviderCapability','ProviderCacheEnvelope','VaultItemProjection','ItemIconIdentity','ItemSearchRow']
    files = [repo/f'VaultSquire/Domain/{n}.swift' for n in domain]
    files += [repo/'VaultSquire/Features/QuickSearch/QuickSearchView.swift',work/'QuickSearchPanelModel.swift',work/'Contracts.swift',site/'scripts/screenshots/capture-support.swift',work/'Capture.swift']
    subprocess.run(['swiftc','-swift-version','5','-parse-as-library',*[str(p) for p in files],'-o',str(work/'capture')],check=True)
    subprocess.run([str(work/'capture'),str(out)],check=True)
