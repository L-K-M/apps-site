#!/usr/bin/env python3
"""Render existing native app views with synthetic in-memory fixtures only.

Requires sibling source checkouts. No app entry point, services, accounts or scanner
is launched. Generated temporary Swift files keep the original view implementation;
Wrapybara's two local form state defaults are seeded with example values.
"""
from pathlib import Path
import subprocess
import tempfile
import sys

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[2]
REPOS = SITE.parent
SDK = Path('/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk')
if not SDK.exists():
    SDK = Path(subprocess.check_output(['xcrun', '--show-sdk-path'], text=True).strip())
OUT = SITE / 'catalogue/assets'
HELPER = HERE.parent / 'capture-support.swift'

def capture(name, repo, files, transform=None):
    with tempfile.TemporaryDirectory(prefix=f'cabinet-{name}-') as scratch:
        paths = []
        for index, relative in enumerate(files):
            source = REPOS / repo / relative
            if transform:
                dest = Path(scratch) / f'Source{index}.swift'
                dest.write_text(transform(source.read_text()))
                paths.append(str(dest))
            else:
                paths.append(str(source))
        binary = str(Path(scratch) / 'capture')
        subprocess.run(['swiftc', '-sdk', str(SDK), '-parse-as-library', '-o', binary,
                        *paths, str(HELPER), str(HERE / f'{name}.swift')], check=True)
        subprocess.run([binary, str(OUT / f'{name}.png')], check=True)

if __name__ == '__main__':
    selected = set(sys.argv[1:])
    if not selected or 'gans' in selected:
        capture('gans', 'Gans', ['Gans/QuickSearch/QuickSearchView.swift', 'Gans/QuickSearch/QuickSearchModel.swift',
            'Gans/QuickSearch/IssuerChip.swift', 'Gans/QuickSearch/SearchFilter.swift', 'Gans/Model/AuthEntry.swift',
            'Gans/OTP/TOTPGenerator.swift', 'Gans/OTP/Base32.swift'])
    if not selected or 'wrapybara' in selected:
        capture('wrapybara', 'Wrapybara', ['Wrapybara/Builder/NewWrapView.swift', 'Wrapybara/Site/URLNormalizer.swift'],
            lambda s: s.replace('@State private var address = ""', '@State private var address = "https://example.com"')
                       .replace('@State private var name = ""', '@State private var name = "Example Notes"'))
    if not selected or 'zen-backup-manager' in selected:
        capture('zen-backup-manager', 'ZenBackupManager', ['ZenBackupManager/UI/BackupDetail.swift',
            'ZenBackupManager/Model/BackupRecord.swift', 'ZenBackupManager/Model/SessionPreview.swift',
            'ZenBackupManager/Model/BackupError.swift', 'ZenBackupManager/Storage/MozillaLZ4.swift'])
    if 'pict' in selected:
        def isolate_pict(source):
            source = source.replace('import PictKit\n', '')
            # Sheets/alerts are closed in this fixture; omit dependencies that could
            # construct stores, web views or directory watchers. Visible UI is intact.
            start = source.find('        .alert(iconProblem:')
            end = source.find('    // MARK: Header')
            if start >= 0:
                source = source[:start] + '    }\n\n' + source[end:]
            return source
        capture('pict', 'Pict', ['App/Pict/Editor/IconsView.swift', 'App/Pict/Editor/IconRow.swift'], isolate_pict)
    if 'zap' in selected:
        def isolate_zap(source):
            source = source.replace('import PictKit\n', '')
            if 'struct AppInfo:' in source:
                # Store-resolution computed properties are unused by the source
                # overlay. Omit their package dependency in the capture target.
                start = source.index('    /// How the shared icon store knows this app.')
                end = source.index('    /// Designated initializer')
                source = source[:start] + source[end:]
            if 'enum WindowEnumerator {' in source:
                source = source[:source.index('/// Enumerates and raises application windows')]
            return source
        capture('zap', 'Zap', ['Zap/Model/Preferences.swift', 'Zap/Model/LoginItemService.swift',
            'Zap/Model/AppInfo.swift', 'Zap/Model/AppearancePreset.swift', 'Zap/Model/ColorHex.swift',
            'Zap/Model/DecorationStyle.swift', 'Zap/Model/DecorationPosition.swift', 'Zap/Model/ScreenScopeMode.swift',
            'Zap/Overlay/OverlayModel.swift', 'Zap/Overlay/OverlayView.swift', 'Zap/Overlay/IconRowGeometry.swift',
            'Zap/Overlay/IconRowMetrics.swift', 'Zap/Overlay/WindowGridGeometry.swift', 'Zap/Overlay/PanelBudget.swift',
            'Zap/Overlay/VisualEffectView.swift', 'Zap/Overlay/CRTScreenOverlay.swift',
            'Zap/Overlay/BoingBallDecoration.swift', 'Zap/Overlay/PanelDecoration.swift',
            'Zap/Switcher/WindowEnumerator.swift', '../Pict/Sources/PictKit/Resolve/IconSourceMode.swift'], isolate_zap)
