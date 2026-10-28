#!/usr/bin/env python3
"""Render Shortking's source inventory without starting its scanners."""
from pathlib import Path
import subprocess
import sys
import tempfile
script = Path(__file__).resolve().parent
repo, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
sdk = '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'
# Compile one capture executable from source, avoiding SDK-mismatched modules.
with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    state = (repo / 'Sources/ShortkingApp/AppState.swift').read_text()
    state = state.replace('private(set) var result', 'var result')
    start = state.index('    func rescan() {')
    cursor = state.index('{', start) + 1
    depth = 1
    while depth:
        if state[cursor] == '{': depth += 1
        if state[cursor] == '}': depth -= 1
        cursor += 1
    state = state[:start] + '    func rescan() {}' + state[cursor:]
    # Default source construction is replaced with an empty source list, and the
    # cache read is empty; all UI data is supplied by the capture main.
    state = state.replace('sources: ScanCoordinator.defaultSources(menuCache: menuCache, triageCache: triageCache)', 'sources: []')
    state = state.replace('let cached = ClaimDatabase().load()', 'let cached: [Claim] = []')
    (work / 'AppState.swift').write_text(state.replace('import ShortkingKit', ''))
    sources = []
    for p in (repo / 'Sources/ShortkingApp/Views').glob('*.swift'):
        copied = work / p.name
        copied.write_text(p.read_text().replace('import ShortkingKit', ''))
        sources.append(str(copied))
    sources += [str(p) for p in (repo / 'Sources/ShortkingKit').rglob('*.swift')]
    (work / 'shortking.swift').write_text((script / 'shortking.swift').read_text().replace('import ShortkingKit', ''))
    subprocess.run(['swiftc', '-parse-as-library', '-sdk', sdk, *sources, str(work / 'AppState.swift'), str(script / 'capture-own-window.swift'), str(work / 'shortking.swift'), '-o', str(work / 'capture')], check=True)
    subprocess.run([str(work / 'capture'), str(output)], check=True)
