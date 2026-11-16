#!/usr/bin/env python3
"""Capture DeviceControlDoctor and MurtenUtilities views offscreen.

Requires macOS, Apple Command Line Tools with the macOS 26.5 SDK, and network
access to fetch the two public repositories at the pinned commits below. Run
from the repository root:

    python3 scripts/screenshots/capture-new-mac-utilities.py
    python3 scripts/screenshots/capture-new-mac-utilities.py devicecontroldoctor

Each capture compiles the app's real source views with a capture harness and
renders them to a bitmap. No app entry point, scanner, watcher, service,
permission query, reset, cleanup or live store runs:

- DeviceControlDoctor: MainView with three invented watch-list models. The
  copied DoctorStore init/load/save and process-inventory helpers are
  neutralised; refresh, discovery, tccutil and resets are never called.
- MurtenUtilities: HomeView with the real ModuleRegistry descriptors and inert
  module providers. AppModel.start() is never called, so no watcher, service,
  suggestion store or update check runs.

Sources are fetched into a temporary directory. `--source` can point at an
existing checkout instead; the pinned commit is still verified.
"""
import argparse
from pathlib import Path
import hashlib
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
SDK = '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'
PINS = {
    'devicecontroldoctor': ('DeviceControlDoctor', 'a188f1ecbbd05e713ab1019b04d2c31546e49603',
                            'device-control-doctor.png'),
    'murtenutilities': ('MurtenUtilities', '43877fb43b2f876e710f5d1b17e62897fea130ba',
                        'murten-utilities.png'),
}


def run(args, cwd=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def fetch(name, revision, dest):
    run(['git', 'clone', '--quiet', f'https://github.com/L-K-M/{name}.git', dest])
    run(['git', '-C', dest, 'checkout', '--quiet', revision])
    actual = subprocess.check_output(['git', '-C', dest, 'rev-parse', 'HEAD'], text=True).strip()
    if actual != revision:
        raise SystemExit(f'{name}: expected {revision}, found {actual}')


def method_end(text, start):
    """Return the index just past the closing brace of a method starting at start."""
    opening = text.index('{', start)
    depth = 1
    index = opening + 1
    while index < len(text) and depth:
        if text[index] == '{':
            depth += 1
        elif text[index] == '}':
            depth -= 1
        index += 1
    if depth:
        raise ValueError('unbalanced braces')
    return index


def replace_method(text, signature, replacement):
    start = text.index(signature)
    end = method_end(text, start)
    return text[:start] + replacement + text[end:]


def patch_doctor_store(path):
    """Make the watch-list store inert and free of process/permission side effects."""
    text = path.read_text()
    start = text.index('    init() {')
    end = text.index('    private func scheduleRefresh', start)
    text = text[:start] + '''    init() {
        storageURL = URL(fileURLWithPath: NSTemporaryDirectory())
        monitorEnabled = false
        launchAtLogin = false
    }

''' + text[end:]
    text = text.replace(
        '''    @Published var monitorEnabled = true {
        didSet { UserDefaults.standard.set(monitorEnabled, forKey: "monitorEnabled") }
    }''',
        '    @Published var monitorEnabled = false')
    text = replace_method(text, '    private func load() {', '    private func load() {\n    }')
    text = replace_method(text, '    private func save() {', '    private func save() {\n    }')
    text = text.replace(
        '    func isRunning(_ app: WatchedApp) -> Bool { !matchingProcesses(app).isEmpty }',
        '    func isRunning(_ app: WatchedApp) -> Bool { false }')
    text = replace_method(
        text, '    func runningPaths(_ app: WatchedApp) -> [String] {',
        '    func runningPaths(_ app: WatchedApp) -> [String] { [] }')
    path.write_text(text)


def strip_local_module_imports(root):
    """Compile the app targets as one module, so drop the intra-package imports."""
    for path in root.rglob('*.swift'):
        text = path.read_text()
        if 'import DoctorCore\n' in text:
            path.write_text(text.replace('import DoctorCore\n', ''))


def capture_devicecontroldoctor(repo, destination):
    with tempfile.TemporaryDirectory(prefix='cabinet-devicecontroldoctor-') as directory:
        work = Path(directory)
        shutil.copytree(repo / 'Sources', work / 'Sources')
        patch_doctor_store(work / 'Sources/DeviceControlDoctor/DoctorStore.swift')
        strip_local_module_imports(work / 'Sources')
        sources = [
            work / 'Sources/DeviceControlDoctor/AppViews.swift',
            work / 'Sources/DeviceControlDoctor/AppCatalog.swift',
            work / 'Sources/DeviceControlDoctor/DoctorStore.swift',
            work / 'Sources/DeviceControlDoctor/IdentityInspector.swift',
            work / 'Sources/DeviceControlDoctor/ProcessRunner.swift',
            work / 'Sources/DoctorCore/Models.swift',
            work / 'Sources/DoctorCore/RepairPlan.swift',
            work / 'Sources/DoctorCore/TCCOutputParser.swift',
        ]
        executable = work / 'capture'
        run(['swiftc', '-parse-as-library', '-sdk', SDK, *sources,
             HERE / 'capture-support.swift', HERE / 'device-control-doctor.swift',
             '-o', executable])
        run([executable, destination])


def capture_murtenutilities(repo, destination):
    with tempfile.TemporaryDirectory(prefix='cabinet-murtenutilities-') as directory:
        work = Path(directory)
        build = work / 'build'
        run(['swift', 'build', '--build-system', 'native', '--sdk', SDK,
             '--target', 'MurtenShell', '--scratch-path', build], cwd=repo)
        objects = []
        for module in ('MurtenCore', 'MurtenModuleKit', 'RigiUI'):
            objects.extend(sorted((build / 'debug' / f'{module}.build').glob('*.o')))
        shell_sources = sorted((repo / 'Sources/MurtenShell').rglob('*.swift'))
        executable = work / 'capture'
        run(['swiftc', '-parse-as-library', '-swift-version', '5', '-sdk', SDK,
             '-I', build / 'debug/Modules', *shell_sources,
             HERE / 'capture-support.swift', HERE / 'murten-utilities.swift',
             *objects,
             '-framework', 'AppKit', '-framework', 'IOKit', '-framework', 'Network',
             '-framework', 'ServiceManagement', '-framework', 'UserNotifications',
             '-framework', 'Combine', '-o', executable])
        run([executable, destination])


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('apps', nargs='*', choices=sorted(PINS),
                        default=['devicecontroldoctor', 'murtenutilities'])
    parser.add_argument('--source', type=Path,
                        help='optional existing checkout parent; name convention <Name>')
    parser.add_argument('--output', type=Path,
                        help='output directory (default: catalogue/assets)')
    args = parser.parse_args()
    output = (args.output or SITE / 'catalogue/assets').resolve()
    output.mkdir(parents=True, exist_ok=True)
    captures = {
        'devicecontroldoctor': capture_devicecontroldoctor,
        'murtenutilities': capture_murtenutilities,
    }
    for app in args.apps:
        name, revision, filename = PINS[app]
        destination = output / filename
        if args.source:
            repo = args.source / name
            actual = subprocess.check_output(['git', '-C', repo, 'rev-parse', 'HEAD'], text=True).strip()
            if actual != revision:
                raise SystemExit(f'{name}: expected {revision}, found {actual}')
            captures[app](repo, destination)
        else:
            with tempfile.TemporaryDirectory(prefix=f'cabinet-{name}-') as directory:
                repo = Path(directory) / name
                fetch(name, revision, repo)
                captures[app](repo, destination)
        print(f'{app}: {destination} {sha256(destination)}')


if __name__ == '__main__':
    main()
