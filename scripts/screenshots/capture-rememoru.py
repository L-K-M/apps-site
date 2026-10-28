#!/usr/bin/env python3
"""Render Rememoru's unchanged native menu builder using fixture-only service data."""
from pathlib import Path
import subprocess, tempfile, sys, re
site=Path(__file__).resolve().parents[2]
repo=Path(sys.argv[1]).resolve()
source=(repo/'Sources/Rememoru/AppDelegate.swift').read_text()
a=source.index('    func menuNeedsUpdate(')
b=source.index('    // MARK: - Actions',a)
menu=source[a:b]
selectors=set(re.findall(r'#selector\((\w+)(?:\(_:\))?\)',menu))
method_names=set(re.findall(r'private (?:static )?func (\w+)',menu))
handlers='\n'.join('@objc func '+name+'(_ sender: Any?) {}' for name in selectors-method_names)
with tempfile.TemporaryDirectory(prefix='rememoru-capture-') as d:
    work=Path(d)
    (work/'Capture.swift').write_text('''import AppKit
struct SnapshotStore {
    struct Entry { var date: Date; var url: URL }
    func list() -> [Entry] {
        [Entry(date: Date(timeIntervalSince1970: 1793174400), url: URL(fileURLWithPath: "/Sample/Layouts/creative.json")),
         Entry(date: Date(timeIntervalSince1970: 1793088000), url: URL(fileURLWithPath: "/Sample/Layouts/research.json"))]
    }
}
struct LayoutService { let store = SnapshotStore() }
struct Preferences {
    static let loginDelayChoices = [10,30,60,120]
    var restoreAtLogin = false
    var launchApps = false
    var loginDelay = 30
}
enum LoginItem { static var isEnabled = false }
enum Permissions {
    enum Kind: CaseIterable {
        case accessibility, screenRecording
        var title: String { self == .accessibility ? "Accessibility" : "Screen Recording" }
    }
    static func isGranted(_ kind: Kind) -> Bool { false }
}
final class MenuFixture: NSObject, NSMenuDelegate {
    var cancellation: Bool? = nil
    var saving = false
    var service: LayoutService? = LayoutService()
    var status: String? = nil
    var lastResult: String? = "Saved 5 windows on 2 spaces"
    var preferences = Preferences()
'''+menu+handlers+'''
}
@main @MainActor enum Capture {
    static func main() throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        app.appearance = NSAppearance(named: .aqua)
        let fixture=MenuFixture()
        let menu=NSMenu(title: "Rememoru")
        menu.autoenablesItems=false
        menu.delegate=fixture
        fixture.menuNeedsUpdate(menu)
        let timer = Timer(timeInterval: 1, repeats: false) { _ in
            let windows=app.windows.filter { $0.isVisible && $0.frame.width > 180 && $0.frame.height > 100 }
            for window in windows {
                print("Menu window: \\(type(of:window)) \\(window.frame)")
            }
            if let window=windows.last, let view=window.contentView?.superview {
                view.wantsLayer=true
                view.layer?.backgroundColor=NSColor.windowBackgroundColor.cgColor
                let bitmap=view.bitmapImageRepForCachingDisplay(in:view.bounds)!
                view.cacheDisplay(in:view.bounds,to:bitmap)
                try! bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
            }
            menu.cancelTracking()
        }
        RunLoop.main.add(timer, forMode: .common)
        app.activate(ignoringOtherApps:true)
        _=menu.popUp(positioning:nil,at:NSPoint(x:500,y:750),in:nil)
    }
}
''')
    subprocess.run(['swiftc','-sdk','/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk','-parse-as-library',str(work/'Capture.swift'),'-o',str(work/'capture')],check=True)
    subprocess.run([str(work/'capture'),str(site/'catalogue/assets/rememoru.png')],check=True,timeout=12)
