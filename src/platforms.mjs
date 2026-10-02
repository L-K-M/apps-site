import { promises as fs } from 'node:fs';
import path from 'node:path';

// Explicit npm "os" values -> platform ids. Negated entries ("!linux")
// exclude rather than support, so they are skipped before this map.
const NPM_OS_TO_PLATFORM = new Map([
  ['darwin', 'macos'],
  ['linux', 'linux'],
  ['win32', 'windows'],
]);

// SwiftPM SupportedPlatform cases -> platform ids.
const SWIFT_CASE_TO_PLATFORM = new Map([
  ['macOS', 'macos'],
  ['iOS', 'ios'],
]);

// Xcode SDK names from SUPPORTED_PLATFORMS / SDKROOT -> platform ids.
// tvOS, watchOS, visionOS and driverkit have no ids here, so they drop out.
const XCODE_SDK_TO_PLATFORM = new Map([
  ['macosx', 'macos'],
  ['iphoneos', 'ios'],
  ['iphonesimulator', 'ios'],
]);

// Tauri bundle.targets values -> platform ids. "all" is intentionally
// absent: a generic target list is not platform evidence.
const TAURI_TARGET_TO_PLATFORM = new Map([
  ['app', 'macos'],
  ['dmg', 'macos'],
  ['appimage', 'linux'],
  ['deb', 'linux'],
  ['rpm', 'linux'],
  ['msi', 'windows'],
  ['nsis', 'windows'],
]);

// Gradle files that may apply the Android application plugin.
const GRADLE_BUILD_FILES = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'app/build.gradle',
  'app/build.gradle.kts',
];

const ANDROID_APPLICATION_PLUGIN = 'com.android.application';
const ANDROID_MANIFEST = 'src/main/AndroidManifest.xml';
const TAURI_CONFIG = 'src-tauri/tauri.conf.json';
const TAURI_ANDROID_GEN = 'src-tauri/gen/android';

// Flutter platform entry files. Folder names alone are not evidence;
// the generated scaffold files must actually exist.
const FLUTTER_PLATFORM_ENTRIES = [
  ['web/index.html', 'web'],
  ['linux/CMakeLists.txt', 'linux'],
  ['windows/CMakeLists.txt', 'windows'],
  ['macos/Runner/Info.plist', 'macos'],
  ['ios/Runner/Info.plist', 'ios'],
  ['android/app/src/main/AndroidManifest.xml', 'android'],
];

const FLUTTER_SDK_DEPENDENCY = /^\s*sdk:\s*flutter\s*$/m;
const SWIFT_PLATFORM_CASE = /\.(macOS|iOS)\s*\(/g;
const PBX_SUPPORTED_PLATFORMS = /SUPPORTED_PLATFORMS\s*=\s*"?([^";]+)/g;
const PBX_SDKROOT = /SDKROOT\s*=\s*([A-Za-z0-9_]+)/g;

const MISSING_FILE_CODES = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (MISSING_FILE_CODES.has(err.code)) return null;
    throw err;
  }
}

// Relevant manifests are required to parse once present; a malformed one
// fails loudly with the file path instead of silently losing evidence.
async function readJson(filePath) {
  const text = await readText(filePath);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`malformed JSON in ${filePath}: ${err.message}`, { cause: err });
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDirectories(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function detectPackageJson(root, found) {
  const manifest = await readJson(path.join(root, 'package.json'));
  if (manifest === null) return;
  const osField = manifest.os;
  const osList = Array.isArray(osField) ? osField : [osField];
  for (const value of osList) {
    if (typeof value !== 'string' || value.startsWith('!')) continue;
    const platform = NPM_OS_TO_PLATFORM.get(value.toLowerCase());
    if (platform) found.add(platform);
  }
}

async function detectSwiftPackage(root, found) {
  const text = await readText(path.join(root, 'Package.swift'));
  if (text === null) return;
  for (const match of text.matchAll(SWIFT_PLATFORM_CASE)) {
    found.add(SWIFT_CASE_TO_PLATFORM.get(match[1]));
  }
}

async function detectAndroidApp(root, found) {
  const appliesPlugin = await gradleAppliesAndroidPlugin(root);
  if (!appliesPlugin) return;
  if (await findAndroidManifest(root)) found.add('android');
}

async function gradleAppliesAndroidPlugin(root) {
  for (const buildFile of GRADLE_BUILD_FILES) {
    const text = await readText(path.join(root, buildFile));
    if (text !== null && text.includes(ANDROID_APPLICATION_PLUGIN)) return true;
  }
  return false;
}

// Manifest must sit at <module>/src/main; checking each top-level dir
// covers app/ and sibling module names without recursing the repo.
async function findAndroidManifest(root) {
  if (await pathExists(path.join(root, ANDROID_MANIFEST))) return true;
  for (const dir of await listDirectories(root)) {
    if (await pathExists(path.join(root, dir, ANDROID_MANIFEST))) return true;
  }
  return false;
}

async function detectXcodeProject(root, found) {
  for (const dir of await listDirectories(root)) {
    if (!dir.endsWith('.xcodeproj')) continue;
    const pbxproj = await readText(path.join(root, dir, 'project.pbxproj'));
    if (pbxproj === null) continue;
    for (const sdk of pbxprojSdks(pbxproj)) {
      const platform = XCODE_SDK_TO_PLATFORM.get(sdk);
      if (platform) found.add(platform);
    }
  }
}

function* pbxprojSdks(text) {
  for (const match of text.matchAll(PBX_SUPPORTED_PLATFORMS)) {
    for (const token of match[1].toLowerCase().split(/\s+/)) {
      if (token) yield token;
    }
  }
  for (const match of text.matchAll(PBX_SDKROOT)) {
    yield match[1].toLowerCase();
  }
}

async function detectTauri(root, found) {
  const config = await readJson(path.join(root, TAURI_CONFIG));
  if (config !== null) {
    const targets = config?.tauri?.bundle?.targets ?? config?.bundle?.targets;
    if (Array.isArray(targets)) {
      for (const target of targets) {
        const platform = TAURI_TARGET_TO_PLATFORM.get(String(target).toLowerCase());
        if (platform) found.add(platform);
      }
    }
  }
  // src-tauri/gen/android only counts once a real manifest exists.
  const genAndroid = path.join(root, TAURI_ANDROID_GEN);
  for (const dir of await listDirectories(genAndroid)) {
    if (await pathExists(path.join(genAndroid, dir, ANDROID_MANIFEST))) {
      found.add('android');
      return;
    }
  }
}

async function detectFlutter(root, found) {
  const pubspec = await readText(path.join(root, 'pubspec.yaml'));
  if (pubspec === null || !FLUTTER_SDK_DEPENDENCY.test(pubspec)) return;
  for (const [entryFile, platform] of FLUTTER_PLATFORM_ENTRIES) {
    if (await pathExists(path.join(root, entryFile))) found.add(platform);
  }
}

// Conservative, evidence-based platform inference for a static app
// directory. Inspects only fixed manifest paths under `root`; never
// executes repository code. A missing root yields no platforms.
export async function detectPlatforms(root) {
  let stat;
  try {
    stat = await fs.stat(root);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];

  const found = new Set();
  await detectPackageJson(root, found);
  await detectSwiftPackage(root, found);
  await detectAndroidApp(root, found);
  await detectXcodeProject(root, found);
  await detectTauri(root, found);
  await detectFlutter(root, found);
  return [...found].sort();
}
