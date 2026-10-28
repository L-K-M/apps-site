#!/usr/bin/env python3
"""Capture the original Alan preferences UI with a disposable defaults suite."""
from pathlib import Path
import subprocess
import sys
import tempfile
script = Path(__file__).resolve().parent
repo, output = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    sources = []
    for name in ['PrefsWindowController.swift', 'Constants.swift', 'Extensions.swift', 'HighlightWindow.swift']:
        source = (repo / 'Alan' / name).read_text().replace('UserDefaults.standard', 'demoDefaults')
        destination = work / name
        destination.write_text(source)
        sources.append(str(destination))
    subprocess.run(['swiftc', '-parse-as-library', '-sdk', '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk', *sources, str(script / 'capture-own-window.swift'), str(script / 'alan.swift'), '-o', str(work / 'capture')], check=True)
    subprocess.run([str(work / 'capture'), str(output)], check=True)
