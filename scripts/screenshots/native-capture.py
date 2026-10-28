#!/usr/bin/env python3
"""Render real source views with synthetic models, without starting the apps.

Requires macOS, Apple's Command Line Tools (including macOS 26.5 SDK), and
sibling checkouts at the pinned commits below. Run from any directory:
    python3 scripts/screenshots/native-capture.py repomen
Screenshots contain only the supplied view. App entry points, collectors,
watchers, launch agents and privileged helpers are never invoked.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
PINS = {
    'repomen': ('RepoMen', '726ca23548439f5d4ef80d00360b9384d1b79523'),
    'bootcaptain': ('BootCaptain', '1fd84a9f6ec8626fa7ef8a5a100554944a733940'),
    'coreography': ('Coreography', 'bc5d6d11337c49d3d917940fb85ab25f6bccc4b3'),
    'jetty': ('Jetty', '0afc76557de51bd3c3ce9d4dc8977c813014e8c2'),
    'topdrawer': ('TopDrawer', 'dd27e91b929f2b26f54fb49a245ac53a3981a4bb'),
}
SDK = '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'


def run(args, cwd=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def source_files(base, names):
    return [base / (name + '.swift') for name in names.split()]


def capture(app, repositories, destination):
    name, revision = PINS[app]
    repo = repositories / name
    actual = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != revision:
        raise SystemExit(f'{name}: expected {revision}, found {actual}; inspect changes before updating the pin')
    with tempfile.TemporaryDirectory(prefix=f'cabinet-{app}-') as directory:
        scratch = Path(directory)
        support = scratch / 'capture-support.swift'
        # ScreenCaptureKit is restricted to this process's own synthetic window;
        # no desktop, other app, menu bar or screen-recording grant is involved.
        text = (HERE / 'capture-support.swift').read_text()
        text = text.replace('    let hosting = NSHostingView(rootView:', '    let controller = NSHostingController(rootView:')
        text = text.replace('.background(Color(nsColor: .windowBackgroundColor)))',
                            '.background(Color(nsColor: .windowBackgroundColor)).frame(width: width, height: height))')
        text = text.replace('    try captureView(hosting,', '    let hosting = controller.view\n    try captureView(hosting,')
        start = text.index('    try captureView(hosting,')
        text = text[:start] + '''    if #available(macOS 14.4, *) {
        try captureOwnView(hosting, size: NSSize(width: width, height: height), to: destination, title: title, styleMask: [.titled, .closable])
    } else {
        throw NSError(domain: "OwnWindowCaptureRequiresMacOS14_4", code: 1)
    }
}
'''
        support.write_text(text)
        compiler = ['swiftc', '-sdk', SDK, '-parse-as-library']
        files = []
        if app == 'repomen':
            copied = scratch / 'RepoMen'
            shutil.copytree(repo / 'RepoMen', copied)
            model = copied / 'Model/AppModel.swift'
            fixture = (HERE / 'repomen-model.swift.txt').read_text()
            model.write_text(model.read_text() + '\n' + fixture)
            files = sorted(p for p in copied.rglob('*.swift') if 'App' not in p.relative_to(copied).parts)
            files.append(copied / 'App/LaunchAtLogin.swift')
        elif app in ('bootcaptain', 'coreography'):
            product = 'BootCaptainKit' if app == 'bootcaptain' else 'CoreographyServices'
            build = scratch / 'build'
            run(['swift', 'build', '--build-system', 'native', '--sdk', SDK,
                 '--target', product, '--scratch-path', build], cwd=repo)
            debug = build / 'debug'
            compiler += ['-I', debug / 'Modules']
            modules = ['BootCaptainCore', 'BootCaptainKit'] if app == 'bootcaptain' else [
                'CoreographyDrivers', 'CoreographyKit', 'CoreographyServices', 'CoreographySystem']
            for module in modules:
                files.extend(sorted((debug / f'{module}.build').glob('*.o')))
            if app == 'bootcaptain':
                files += sorted(p for p in (repo / 'App').rglob('*.swift') if p.name != 'BootCaptainApp.swift')
            else:
                compiler += ['-target', 'arm64-apple-macosx26.0', '-I', repo / 'Sources/CoreographySystem/include',
                             '-I', repo / 'Sources/CSQLite', '-Xcc',
                             f'-fmodule-map-file={debug}/CoreographySystem.build/module.modulemap',
                             '-lsqlite3', '-framework', 'IOKit']
                for file in (repo / 'App').glob('*.swift'):
                    if file.name in ('CoreographyApp.swift', 'Intents.swift'):
                        continue
                    copied = scratch / file.name
                    # The collapsed Ask panel does not need to read credentials.
                    copied.write_text(file.read_text().replace(
                        '.task { await model.refreshProviderKey() }', '.task { }'))
                    files.append(copied)
        elif app == 'jetty':
            files = source_files(repo / 'Jetty/Model', '''Preferences PreferenceEnums AppearancePreset ColorHex
                HotkeyBinding JettyMenuGlyph DockEdge DecorationStyle DecorationPosition ClockFaceStyle
                SystemMonitorStyle RGBA8 DockAnchor TrashIconStyle''')
            files += source_files(repo / 'Jetty/Settings', 'AppearanceView AngleDial')
            files.append(repo / 'Jetty/Hotkeys/KeyCodes.swift')
            binding = scratch / 'color-binding.swift'
            text = (repo / 'Jetty/Settings/SettingsView.swift').read_text()
            binding.write_text('import SwiftUI\n' + text[text.index('func jettyColorBinding'):])
            files.append(binding)
        elif app == 'topdrawer':
            files = source_files(repo / 'MacDring/Model', '''Preferences PreferenceEnums TabBehavior
                TabConcealment LoginItemManaging ColorHex Edge''')
            files += source_files(repo / 'MacDring/Common', 'VisualEffectView TabShapes')
            files.append(repo / 'MacDring/Settings/AppearanceView.swift')
            decoder = scratch / 'lenient.swift'
            text = (repo / 'MacDring/Model/LenientDecoding.swift').read_text()
            # Retain the shared extension; its unrelated DrawerItem decoder is
            # unnecessary when rendering only the built-in appearance preview.
            decoder.write_text(text[:text.index('/// Decodes a single')])
            files.append(decoder)
        executable = scratch / 'capture'
        run(compiler + files + [support, HERE / 'capture-own-window.swift', HERE / f'{app}.swift', '-o', executable], cwd=repo)
        run([executable, destination])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', choices=PINS)
    parser.add_argument('--repos', type=Path, default=SITE.parent)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    capture(args.app, args.repos.resolve(), args.output or SITE / 'catalogue/assets' / f'{args.app}.png')
