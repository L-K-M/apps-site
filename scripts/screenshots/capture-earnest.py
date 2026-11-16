#!/usr/bin/env python3
"""Build the pinned public Earnest client and capture it with synthetic API data.

Requires Node, pnpm, git and this catalogue's npm dependencies/Playwright Chromium.
No backend, database, GUI app, live account or HTTP server is started. All browser
requests are fulfilled locally or blocked by capture-earnest.mjs.
"""
from pathlib import Path
import subprocess
import tempfile

REVISION = 'd0ccb25d482777db395dc903306deb19180fee45'
SITE = Path(__file__).resolve().parents[2]

with tempfile.TemporaryDirectory(prefix='cabinet-earnest-') as directory:
    repo = Path(directory) / 'Earnest'
    subprocess.run(['git', 'clone', '--quiet', 'https://github.com/L-K-M/Earnest.git', str(repo)],
                   check=True, timeout=120)
    subprocess.run(['git', '-C', str(repo), 'checkout', '--quiet', REVISION],
                   check=True, timeout=30)
    web = repo / 'web'
    subprocess.run(['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'],
                   cwd=web, check=True, timeout=180)
    subprocess.run(['pnpm', 'exec', 'vite', 'build'], cwd=web, check=True, timeout=120)
    subprocess.run(['node', str(SITE / 'scripts/screenshots/capture-earnest.mjs'),
                    str(web / 'dist')], cwd=SITE, check=True, timeout=60)
