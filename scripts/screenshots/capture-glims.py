#!/usr/bin/env python3
"""Render Glims's unchanged Preferences panel with isolated factory defaults.

Downloads two public source files at a pinned revision. No editor engine,
application delegate, recovery service, user documents or desktop capture.
Requires macOS, Swift and the macOS 26.5 Command Line Tools SDK.
"""
from pathlib import Path
import os
import subprocess
import tempfile
from urllib.request import urlopen

REVISION = 'ab117c7039608647b7952ebf0a9c46e1edf58583'
RIGI_REVISION = 'aec92e16ec818759a220f33096ebbc43ce41179a'
SITE = Path(__file__).resolve().parents[2]
SDK = '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'

with tempfile.TemporaryDirectory(prefix='glims-preferences-capture-') as directory:
    work = Path(directory)
    sources = work / 'Sources/Capture'
    sources.mkdir(parents=True)
    for name in ['EditorPreferences.swift', 'PreferencesWindowController.swift']:
        url = f'https://raw.githubusercontent.com/L-K-M/Glims/{REVISION}/Sources/GlimsKit/Preferences/{name}'
        with urlopen(url, timeout=30) as response:
            (sources / name).write_bytes(response.read())
    (work / 'Package.swift').write_text(f'''// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "Capture", platforms: [.macOS(.v13)],
    dependencies: [.package(url: "https://github.com/L-K-M/Rigi.git", revision: "{RIGI_REVISION}")],
    targets: [.executableTarget(name: "Capture", dependencies: [.product(name: "RigiUI", package: "Rigi")])])
''')
    (sources / 'Capture.swift').write_text('''import AppKit
import RigiUI
@main @MainActor enum Capture {
    static func main() throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        app.appearance = NSAppearance(named: .aqua)
        let suite = "ch.lkmc.Cabinet.GlimsCapture.\\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let preferences = EditorPreferences(defaults: defaults)
        ClassicChrome.apply(scheme: preferences.appearance)
        let controller = PreferencesWindowController(preferences: preferences)
        let window = controller.window!
        // Keep the panel offscreen. Only its own view hierarchy is rendered.
        window.setContentSize(NSSize(width: 440, height: 290))
        let view = window.contentView!
        view.layoutSubtreeIfNeeded()
        view.displayIfNeeded()
        guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            throw NSError(domain: "GlimsCapture", code: 1)
        }
        view.cacheDisplay(in: view.bounds, to: bitmap)
        guard let data = bitmap.representation(using: .png, properties: [:]) else {
            throw NSError(domain: "GlimsCapture", code: 2)
        }
        try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
        window.close()
    }
}
''')
    environment = {**os.environ, 'SDKROOT': SDK}
    subprocess.run(['swift', 'build', '--package-path', str(work), '--sdk', SDK],
                   check=True, env=environment, timeout=300)
    binary_directory = subprocess.check_output(
        ['swift', 'build', '--package-path', str(work), '--sdk', SDK, '--show-bin-path'],
        text=True, env=environment, timeout=30).strip()
    subprocess.run([str(Path(binary_directory) / 'Capture'),
                    str(SITE / 'catalogue/assets/glims.png')],
                   check=True, env=environment, timeout=30)
