#!/usr/bin/env python3
"""Render LLimit's own widget and sample data; never load stored account data."""
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[2]
REPO = SITE.parent / 'LLimit'
CORE = REPO / 'Packages/QuotaCore'
SDK = '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'
with tempfile.TemporaryDirectory(prefix='cabinet-llimit-') as scratch:
    scratch = Path(scratch)
    # QuotaCore is Foundation-only. Building the library does not execute clients.
    subprocess.run(['swiftc', '-sdk', SDK, '-swift-version', '5', '-parse-as-library',
        '-emit-library', '-static', '-emit-module', '-module-name', 'QuotaCore',
        '-emit-module-path', str(scratch / 'QuotaCore.swiftmodule'),
        *map(str, sorted((CORE / 'Sources/QuotaCore').rglob('*.swift'))),
        '-o', str(scratch / 'libQuotaCore.a')], check=True)
    combined = scratch / 'Capture.swift'
    # Joining retains private helper access in the original view's file scope.
    combined.write_text('\n'.join((REPO / p).read_text() for p in [
        'LLimitWidgetExtension/QuotaTimelineProvider.swift', 'LLimitWidgetExtension/LLimitQuotaWidget.swift'
    ]) + (HERE / 'llimit.swift').read_text())
    binary = str(scratch / 'capture')
    subprocess.run(['swiftc', '-sdk', SDK, '-swift-version', '5', '-parse-as-library', '-I', str(scratch),
        '-L', str(scratch), '-lQuotaCore', str(REPO / 'Shared/SharedConstants.swift'),
        str(REPO / 'Shared/LimitKindColorScheme.swift'), str(combined),
        str(HERE.parent / 'capture-support.swift'), '-o', binary], check=True)
    subprocess.run([binary, str(SITE / 'catalogue/assets/llimit.png')], check=True)
