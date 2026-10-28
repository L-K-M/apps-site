#!/usr/bin/env python3
"""Capture Sortomat source views with a synthetic in-memory inbox, with automation disabled."""
from pathlib import Path
import subprocess, tempfile, sys, os
site = Path(__file__).resolve().parents[2]
repo = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='sortomat-capture-') as d:
    work=Path(d)
    appstate=(repo/'Sortomat/App/AppState.swift').read_text()
    start=appstate.index('    init() {')
    brace=appstate.index('{',start)
    depth=1; end=brace+1
    while depth:
        if appstate[end]=='{': depth+=1
        if appstate[end]=='}': depth-=1
        end+=1
    # No defaults, Keychain, permission request, watchers, timers or scan.
    appstate=appstate[:start]+'''    init() {
        config = Config()
        paused = false
        apiKeyMissing = false
    }'''+appstate[end:]
    (work/'AppState.swift').write_text(appstate)
    (work/'Capture.swift').write_text('''import AppKit
import SwiftUI
@main @MainActor enum Capture {
    static func main() throws {
        let state = AppState()
        let rule = Rule(name: "Sample Downloads", watchPath: "/Sample/Downloads", targetPath: "/Sample/Library", prompt: "File books, drawings and receipts into their folders.", dryRun: true)
        state.config.rules = [rule, Rule(name: "Sample Screenshots", enabled: false, watchPath: "/Sample/Pictures", targetPath: "/Sample/Library/Images")]
        let examples = [("Garden guide.epub", "Books/Garden guide.epub"), ("Observatory sketch.png", "Images/Observatory sketch.png"), ("Workshop receipt.pdf", "Receipts/Workshop receipt.pdf")]
        state.pendingActions = examples.map { file, destination in
            PlannedAction(ruleID: rule.id, ruleName: rule.name, source: URL(fileURLWithPath: "/Sample/Downloads/"+file), kind: .move, destination: URL(fileURLWithPath: "/Sample/Library/"+destination), origin: .step, reason: "Matched sample file type", confidence: nil, copyInsteadOfMove: false)
        }
        let view = NSHostingView(rootView: MainView(selection: .constant(.inbox)).environmentObject(state).frame(width: 1000, height: 680))
        try captureOwnView(view, size: NSSize(width: 1000, height: 680), to: CommandLine.arguments[1], title: "Sortomat")
    }
}
''')
    files=[p for p in (repo/'Sortomat').rglob('*.swift') if p.name not in ['SortomatMain.swift','AppState.swift']]
    (work/'capture-own-window.swift').write_text((site/'scripts/screenshots/capture-own-window.swift').read_text())
    files += [work/'AppState.swift',work/'capture-own-window.swift',work/'Capture.swift']
    subprocess.run(['swiftc','-sdk','/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk','-swift-version','5','-target','arm64-apple-macos14.4','-parse-as-library',*[str(p) for p in files],'-o',str(work/'capture')],check=True)
    env=dict(os.environ,SORTOMAT_CONFIG_DIR=str(work/'isolated-config'))
    subprocess.run([str(work/'capture'),str(site/'catalogue/assets/sortomat.png')],env=env,check=True)
