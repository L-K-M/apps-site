import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { detectPlatforms } from '../src/platforms.mjs';

// Builds a fixture tree from { relativePath: contents } under a mkdtemp root.
async function withFixture(files, run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'platforms-'));
  try {
    for (const [relPath, contents] of Object.entries(files)) {
      const target = path.join(root, relPath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, contents);
    }
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function detectIn(files) {
  let platforms;
  return withFixture(files, async (root) => {
    platforms = await detectPlatforms(root);
  }).then(() => platforms);
}

test('returns [] for a nonexistent root', async () => {
  const missing = path.join(os.tmpdir(), `platforms-missing-${process.pid}`);
  assert.deepEqual(await detectPlatforms(missing), []);
});

test('returns [] when nothing is evidence', async () => {
  // Folder names, embedded frontends, docker and generic CMake imply nothing.
  const platforms = await detectIn({
    'ios/.keep': '',
    'android/.keep': '',
    'web/index.html': '<html></html>',
    'frontend/index.html': '<html></html>',
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)',
    'Dockerfile': 'FROM scratch',
    'app/src/main/AndroidManifest.xml': '<manifest/>',
    'capabilities/default.json': '{"permissions":[]}',
  });
  assert.deepEqual(platforms, []);
});

test('maps explicit package.json os values to platforms', async () => {
  const platforms = await detectIn({
    'package.json': JSON.stringify({
      name: 'demo',
      os: ['darwin', 'linux', 'win32'],
    }),
  });
  assert.deepEqual(platforms, ['linux', 'macos', 'windows']);
});

test('ignores negated package.json os values', async () => {
  const platforms = await detectIn({
    'package.json': JSON.stringify({ name: 'demo', os: ['!linux', 'win32'] }),
  });
  assert.deepEqual(platforms, ['windows']);
});

test('detects Swift Package.swift supported platforms', async () => {
  const platforms = await detectIn({
    'Package.swift': `// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Demo",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [],
    targets: []
)
`,
  });
  assert.deepEqual(platforms, ['ios', 'macos']);
});

test('detects Android via Gradle plugin plus real manifest', async () => {
  const platforms = await detectIn({
    'build.gradle': "plugins { id 'com.android.application' version '8.5.0' apply false }",
    'app/build.gradle.kts': 'plugins { id("com.android.application") }',
    'app/src/main/AndroidManifest.xml': '<manifest package="com.example"/>',
  });
  assert.deepEqual(platforms, ['android']);
});

test('requires both plugin and manifest for Android', async () => {
  assert.deepEqual(
    await detectIn({
      'build.gradle': "id 'com.android.application'",
    }),
    [],
  );
  assert.deepEqual(
    await detectIn({
      'app/src/main/AndroidManifest.xml': '<manifest/>',
    }),
    [],
  );
});

test('detects Xcode platforms from SUPPORTED_PLATFORMS and SDKROOT', async () => {
  const iosOnly = await detectIn({
    'Demo.xcodeproj/project.pbxproj':
      'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; SDKROOT = iphoneos;',
  });
  assert.deepEqual(iosOnly, ['ios']);
  const macOnly = await detectIn({
    'Demo.xcodeproj/project.pbxproj': 'SDKROOT = macosx;',
  });
  assert.deepEqual(macOnly, ['macos']);
  const watchOnly = await detectIn({
    'Demo.xcodeproj/project.pbxproj': 'SUPPORTED_PLATFORMS = "watchos watchsimulator";',
  });
  assert.deepEqual(watchOnly, []);
});

test('maps specific Tauri bundle targets', async () => {
  const v1 = await detectIn({
    'src-tauri/tauri.conf.json': JSON.stringify({
      tauri: { bundle: { targets: ['dmg', 'nsis'] } },
    }),
  });
  assert.deepEqual(v1, ['macos', 'windows']);
  const v2 = await detectIn({
    'src-tauri/tauri.conf.json': JSON.stringify({
      bundle: { targets: ['deb', 'appimage', 'msi'] },
    }),
  });
  assert.deepEqual(v2, ['linux', 'windows']);
});

test('does not guess platforms from Tauri "all" targets', async () => {
  const platforms = await detectIn({
    'src-tauri/tauri.conf.json': JSON.stringify({
      tauri: { bundle: { targets: 'all' } },
    }),
  });
  assert.deepEqual(platforms, []);
});

test('detects Tauri gen/android only with an actual manifest', async () => {
  const withManifest = await detectIn({
    'src-tauri/tauri.conf.json': JSON.stringify({ bundle: { targets: 'all' } }),
    'src-tauri/gen/android/app/src/main/AndroidManifest.xml': '<manifest/>',
  });
  assert.deepEqual(withManifest, ['android']);
  const withoutManifest = await detectIn({
    'src-tauri/tauri.conf.json': JSON.stringify({ bundle: { targets: 'all' } }),
    'src-tauri/gen/android/app/.keep': '',
  });
  assert.deepEqual(withoutManifest, []);
});

test('detects Flutter platforms only from real entry files', async () => {
  const pubspec = `name: demo
dependencies:
  flutter:
    sdk: flutter
`;
  const platforms = await detectIn({
    'pubspec.yaml': pubspec,
    'web/index.html': '<html></html>',
    'macos/Runner/Info.plist': '<plist/>',
    'android/app/src/main/AndroidManifest.xml': '<manifest/>',
    'ios/.keep': '', // folder name alone is not evidence
  });
  assert.deepEqual(platforms, ['android', 'macos', 'web']);
});

test('does not infer Flutter platforms without the flutter dependency', async () => {
  const platforms = await detectIn({
    'pubspec.yaml': 'name: demo\ndependencies:\n  http: ^1.0.0\n',
    'web/index.html': '<html></html>',
    'ios/Runner/Info.plist': '<plist/>',
  });
  assert.deepEqual(platforms, []);
});

test('merges evidence into a sorted unique platform list', async () => {
  const platforms = await detectIn({
    'package.json': JSON.stringify({ name: 'demo', os: ['darwin', 'linux'] }),
    'Package.swift': 'platforms: [.macOS(.v13), .iOS(.v15)]',
    'src-tauri/tauri.conf.json': JSON.stringify({
      tauri: { bundle: { targets: ['dmg', 'deb'] } },
    }),
    'src-tauri/gen/android/app/src/main/AndroidManifest.xml': '<manifest/>',
  });
  assert.deepEqual(platforms, ['android', 'ios', 'linux', 'macos']);
});

test('fails with file context on malformed package.json', async () => {
  await withFixture({ 'package.json': '{ not json' }, async (root) => {
    await assert.rejects(
      detectPlatforms(root),
      (err) => {
        assert.match(err.message, /malformed JSON/);
        assert.match(err.message, /package\.json/);
        return true;
      },
    );
  });
});

test('fails with file context on malformed tauri.conf.json', async () => {
  await withFixture({ 'src-tauri/tauri.conf.json': '{oops' }, async (root) => {
    await assert.rejects(
      detectPlatforms(root),
      (err) => {
        assert.match(err.message, /malformed JSON/);
        assert.match(err.message, /tauri\.conf\.json/);
        return true;
      },
    );
  });
});
