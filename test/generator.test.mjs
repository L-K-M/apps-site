import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { BuildMode, buildSite } from '../src/build.mjs';
import { exists } from '../src/paths.mjs';
import { startPreview } from '../src/preview.mjs';

const exec = promisify(execFile);
const CLI = fileURLToPath(new URL('../bin/apps-site.mjs', import.meta.url));
const APP = { id: 'sample', name: 'Sample', summary: 'An app for testing.', category: 'Utilities', platforms: ['web'] };
const IMAGE = await sharp({ create: { width: 800, height: 600, channels: 4, background: '#993c2c' } }).png().toBuffer();

function manifest(apps, extra = {}) {
  return JSON.stringify({ schemaVersion: 1, apps, ...extra });
}

async function fixture(t, files = {}, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'apps-site-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'catalogue'));
  await mkdir(join(root, 'repos'));
  const config = { title: 'Test Directory', catalogues: ['catalogue'], repositoryRoots: ['repos'], output: 'dist', ...options };
  await writeFile(join(root, 'site.json'), JSON.stringify(config));

  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  return { root, config: join(root, 'site.json'), output: join(root, 'dist') };
}

async function fingerprint(root) {
  const files = new Map();
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(prefix, entry.name);
      if (entry.isDirectory()) await visit(join(directory, entry.name), path);
      else files.set(path, createHash('sha256').update(await readFile(join(directory, entry.name))).digest('hex'));
    }
  }
  await visit(root);
  return files;
}

test('builds a monorepo and a repo-less web app with portable media and links', async (t) => {
  const desktop = { ...APP, id: 'desktop', name: 'Desktop', path: 'apps/desktop', platforms: undefined, screenshots: [{ src: 'screen.png', alt: 'The desktop window' }] };
  const web = { ...APP, id: 'web-only', links: { website: 'https://tool.example.org' } };
  const { config, output, root } = await fixture(t, {
    'repos/suite/app-directory.json': manifest([desktop, { ...APP, id: 'mobile', path: 'apps/mobile', platforms: ['android'] }], { repository: 'https://github.com/example/suite' }),
    'repos/suite/apps/desktop/package.json': '{"os":["darwin","linux"]}',
    'repos/suite/apps/desktop/screen.png': IMAGE,
    'repos/suite/apps/mobile/.keep': '',
    'catalogue/web.json': manifest([web]),
  }, { url: 'https://directory.example.org/tools' });

  await buildSite(config);
  const data = JSON.parse(await readFile(join(output, 'apps.json'), 'utf8'));
  const native = data.apps.find((app) => app.id === 'desktop');
  assert.deepEqual(native.platforms, ['linux', 'macos']);
  assert.equal(native.platformsInferred, true);
  assert.equal(native.maturity, null);
  assert.equal(native.links.source, 'https://github.com/example/suite');
  assert.equal('source' in native, false);
  assert.equal('path' in native, false);
  assert.deepEqual(await readFile(join(output, native.screenshots[0].src)), IMAGE);
  assert.match(native.screenshots[0].thumbnail, /assets\/media\/.+\.webp$/);
  const preview = await sharp(await readFile(join(output, native.screenshots[0].thumbnail))).metadata();
  assert.equal(preview.format, 'webp');
  assert.ok(preview.width <= 640 && preview.height <= 400);
  assert.ok(!(await readFile(join(output, 'apps.json'), 'utf8')).includes(root));

  const detail = await readFile(join(output, 'apps/desktop/index.html'), 'utf8');
  assert.match(detail, /href="\.\.\/\.\.\/assets\/style.css"/);
  assert.match(detail, /src="\.\.\/\.\.\/assets\/media\//);
  assert.match(detail, /https:\/\/directory\.example\.org\/tools\/apps\/desktop\//);
  const webPage = await readFile(join(output, 'apps/web-only/index.html'), 'utf8');
  assert.match(webPage, /Open website/);
  assert.doesNotMatch(webPage, /Downloads|Source code/);
  assert.equal(webPage.split(APP.summary).length - 1, 3); // meta description, OG description, visible summary
  assert.match(await readFile(join(output, 'sitemap.xml'), 'utf8'), /\/tools\/apps\/desktop\//);
});

test('repo-local metadata overrides central entries while duplicates within a tier fail', async (t) => {
  const { config, root } = await fixture(t, {
    'catalogue/seed.json': manifest([APP]),
    'repos/native/app-directory.json': manifest([{ ...APP, name: 'Authoritative', maturity: 'polished' }]),
  });
  const { apps } = await buildSite(config, {}, BuildMode.CHECK);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].name, 'Authoritative');
  assert.equal(apps[0].maturity, 'polished');

  await mkdir(join(root, 'repos/duplicate'));
  await writeFile(join(root, 'repos/duplicate/app-directory.json'), manifest([APP]));
  await assert.rejects(buildSite(config), /Duplicate app id "sample".*duplicate.*native/);
});

test('visibility defaults to visible and hidden apps leave no public metadata or media', async (t) => {
  const hidden = { ...APP, id: 'hidden-app', name: 'Private fixture app', category: 'Private category', status: 'hidden', path: 'missing/app', platforms: undefined, screenshots: [{ src: 'missing.png', alt: 'Private screen' }] };
  const { config, output } = await fixture(t, {
    'catalogue/apps.json': manifest([APP, { ...APP, id: 'explicit-visible', status: 'visible' }, hidden]),
  }, { url: 'https://directory.example.org/' });

  const { apps } = await buildSite(config);
  assert.deepEqual(apps.map((app) => app.id).sort(), ['explicit-visible', 'sample']);
  assert.ok(apps.every((app) => app.status === 'visible'));
  assert.equal(await exists(join(output, 'apps/hidden-app')), false);
  assert.equal(await exists(join(output, 'assets/media')), false);
  for (const file of ['index.html', 'apps.json', 'sitemap.xml']) {
    assert.doesNotMatch(await readFile(join(output, file), 'utf8'), /hidden-app|Private fixture|Private category|missing\.png/);
  }
});

test('repo-local visibility wins over central visibility before publication', async (t) => {
  const { config, output, root } = await fixture(t, {
    'catalogue/seed.json': manifest([{ ...APP, status: 'visible', icon: { src: 'screen.png', alt: 'Only the hidden app uses this' } }]),
    'catalogue/screen.png': IMAGE,
    'repos/suite/app-directory.json': manifest([{ ...APP, status: 'hidden' }, { ...APP, id: 'sibling', status: 'visible' }]),
  });
  let result = await buildSite(config);
  assert.deepEqual(result.apps.map((app) => app.id), ['sibling']);
  assert.equal(await exists(join(output, 'apps/sample')), false);
  assert.equal(await exists(join(output, 'assets/media')), false);

  await writeFile(join(root, 'catalogue/seed.json'), manifest([{ ...APP, status: 'hidden' }]));
  await writeFile(join(root, 'repos/suite/app-directory.json'), manifest([{ ...APP, status: 'visible' }, { ...APP, id: 'sibling', status: 'hidden' }]));
  result = await buildSite(config);
  assert.deepEqual(result.apps.map((app) => app.id), ['sample']);
  assert.equal(await exists(join(output, 'apps/sibling')), false);
});

test('changing visible to hidden removes old pages and media; showing it restores them', async (t) => {
  const app = { ...APP, status: 'visible', screenshots: [{ src: 'screen.png', alt: 'Screen' }] };
  const { config, output, root } = await fixture(t, {
    'catalogue/app.json': manifest([app]),
    'catalogue/screen.png': IMAGE,
  });
  await buildSite(config);
  assert.equal(await exists(join(output, 'apps/sample/index.html')), true);
  await writeFile(join(root, 'catalogue/app.json'), manifest([{ ...app, status: 'hidden' }]));
  const { apps } = await buildSite(config);
  assert.equal(apps.length, 0);
  assert.equal(await exists(join(output, 'apps/sample')), false);
  assert.equal(await exists(join(output, 'assets/media')), false);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'apps.json'), 'utf8')).apps, []);

  await writeFile(join(root, 'catalogue/app.json'), manifest([app]));
  await buildSite(config);
  assert.equal(await exists(join(output, 'apps/sample/index.html')), true);
  assert.equal(await exists(join(output, 'assets/media')), true);
});

test('visibility rejects unsupported statuses and still rejects duplicate hidden ids', async (t) => {
  const { config, root } = await fixture(t);
  const file = join(root, 'catalogue/app.json');
  for (const status of ['private', 'VISIBLE', null, false]) {
    await writeFile(file, manifest([{ ...APP, status }]));
    await assert.rejects(buildSite(config), /status/);
  }

  await writeFile(file, manifest([{ ...APP, status: 'hidden' }, APP]));
  await assert.rejects(buildSite(config), /Duplicate app id/);
});

test('hidden app directories remain protected from output replacement', async (t) => {
  const { config, root } = await fixture(t, {
    'repos/suite/app-directory.json': manifest([{ ...APP, status: 'hidden', path: 'app' }]),
    'repos/suite/app/.apps-site': 'apps-site output v1\n',
    'repos/suite/app/private-code.txt': 'keep this source',
  }, { output: 'repos/suite/app' });
  await assert.rejects(buildSite(config), /replace an input directory/);
  assert.equal(await readFile(join(root, 'repos/suite/app/private-code.txt'), 'utf8'), 'keep this source');
});

test('hidden repo overrides do not resolve unavailable central app sources', async (t) => {
  const { config } = await fixture(t, {
    'catalogue/seed.json': manifest([{ ...APP, path: 'unavailable/fallback', platforms: undefined }]),
    'repos/suite/app-directory.json': manifest([{ ...APP, status: 'hidden', path: 'unavailable/hidden', platforms: undefined }]),
    'repos/suite/package.json': '{ malformed',
  });
  const { apps } = await buildSite(config);
  assert.deepEqual(apps, []);
});

test('discovers symlinked repo and catalogue directories without cycles or double counting', async (t) => {
  const { config, root } = await fixture(t, {
    'actual-repo/app-directory.json': manifest([APP]),
    'actual-catalogue/app.json': manifest([{ ...APP, id: 'central' }]),
  });
  await symlink(join(root, 'actual-repo'), join(root, 'repos/linked'));
  await symlink(join(root, 'actual-repo'), join(root, 'repos/alias'));
  await symlink(join(root, 'actual-catalogue'), join(root, 'catalogue/linked'));
  await symlink(join(root, 'catalogue'), join(root, 'actual-catalogue/cycle'));
  const { apps } = await buildSite(config, {}, BuildMode.CHECK);
  assert.deepEqual(apps.map((app) => app.id).sort(), ['central', 'sample']);
});

test('central entries do not infer platforms from unrelated catalogue files', async (t) => {
  const { config } = await fixture(t, {
    'catalogue/app.json': manifest([{ ...APP, platforms: undefined }]),
    'catalogue/Package.swift': 'platforms: [.macOS(.v13)]',
  });
  const { apps } = await buildSite(config, {}, BuildMode.CHECK);
  assert.deepEqual(apps[0].platforms, []);
  assert.equal(apps[0].platformsInferred, false);
});

test('source origins are read from repos mounted with different ownership', async (t) => {
  const { config, root, output } = await fixture(t, { 'repos/app/app-directory.json': manifest([APP]) });
  const repo = join(root, 'repos/app');
  await exec('git', ['init', '--quiet', repo]);
  await exec('git', ['-C', repo, 'config', '--local', 'remote.origin.url', 'git@github.com:example/native.git']);
  await exec(process.execPath, [CLI, 'build', '--config', config], { env: { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' } });
  const data = JSON.parse(await readFile(join(output, 'apps.json'), 'utf8'));
  assert.equal(data.apps[0].links.source, 'https://github.com/example/native');
});

test('an expired build lease is reclaimed but an active lease is respected', async (t) => {
  const { config, output, root } = await fixture(t, { 'catalogue/app.json': manifest([APP]) });
  const lock = join(root, '.dist.apps-site.lock');
  await mkdir(lock);
  await assert.rejects(buildSite(config), /Another build/);
  const expired = new Date(Date.now() - 60000);
  await utimes(lock, expired, expired);
  await buildSite(config);
  assert.equal(await exists(join(output, 'index.html')), true);
  assert.equal(await exists(lock), false);
});

test('published roots can be read and traversed by a separate static-server user', async (t) => {
  const OTHER_READ_AND_EXECUTE = 0o005;
  const { config, output } = await fixture(t, { 'catalogue/app.json': manifest([APP]) });
  await buildSite(config);
  assert.equal((await fs.stat(output)).mode & OTHER_READ_AND_EXECUTE, OTHER_READ_AND_EXECUTE);
});

test('a failed publish and failed rollback preserve the backup for recovery', async (t) => {
  const { config, output, root } = await fixture(t, { 'catalogue/app.json': manifest([APP]) });
  await buildSite(config);
  const original = await fingerprint(output);
  const rename = fs.rename;
  const mock = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === output) throw new Error('simulated publish/rollback failure');
    return rename(from, to);
  });
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  syncBuiltinESMExports();
  await assert.rejects(buildSite(config), /simulated/);
  mock.mock.restore();
  syncBuiltinESMExports();
  const backup = (await readdir(root)).find((name) => name.endsWith('-previous'));
  assert.ok(backup, 'the last good site must not be deleted after failed rollback');
  assert.deepEqual(await fingerprint(join(root, backup)), original);
});

test('rejects misspelled fields, invalid versions, unsafe URLs and page ids with source context', async (t) => {
  const { config, root } = await fixture(t);
  const file = join(root, 'catalogue/app.json');
  const cases = [
    [manifest([{ ...APP, matuirty: 'usable' }]), /app\.json: invalid manifest.*\n.*matuirty/],
    [JSON.stringify({ schemaVersion: 2, apps: [APP] }), /schemaVersion/],
    [manifest([{ ...APP, links: { website: 'javascript:alert(1)' } }]), /web-url/],
    [manifest([{ ...APP, links: { source: 'https://user:password@example.org' } }]), /web-url/],
    [manifest([{ ...APP, id: '../escape' }]), /pattern/],
  ];

  for (const [contents, expected] of cases) {
    await writeFile(file, contents);
    await assert.rejects(buildSite(config), expected);
  }
});

test('rejects local path and symlink escapes, missing images, and unsafe image URLs', async (t) => {
  const { config, root } = await fixture(t, { 'outside.png': IMAGE });
  const file = join(root, 'catalogue/app.json');
  await symlink(join(root, 'outside.png'), join(root, 'catalogue/link.png'));
  const cases = [
    [{ ...APP, path: '..' }, /Path escapes/],
    [{ ...APP, screenshots: [{ src: '../outside.png', alt: 'Outside' }] }, /image.*Path escapes/],
    [{ ...APP, screenshots: [{ src: 'link.png', alt: 'Symlink' }] }, /image.*Symlink escapes/],
    [{ ...APP, icon: { src: 'missing.png', alt: 'Missing' } }, /cannot read image/],
    [{ ...APP, icon: { src: 'data:image/svg+xml,<svg/>', alt: 'Unsafe' } }, /HTTP\(S\)/],
  ];

  for (const [app, expected] of cases) {
    await writeFile(file, manifest([app]));
    await assert.rejects(buildSite(config), expected);
  }
});

test('rebuilds deterministically, removes stale files, and preserves output on failed input', async (t) => {
  const { config, output, root } = await fixture(t, {
    'catalogue/seed.json': manifest([APP, { ...APP, id: 'removed', screenshots: [{ src: 'screen.png', alt: 'Screen' }] }]),
    'catalogue/screen.png': IMAGE,
  });
  await buildSite(config);
  const first = await fingerprint(output);
  await buildSite(config);
  assert.deepEqual(await fingerprint(output), first);

  await writeFile(join(root, 'catalogue/seed.json'), '{ broken');
  await assert.rejects(buildSite(config), /seed\.json/);
  assert.deepEqual(await fingerprint(output), first);

  await writeFile(join(root, 'catalogue/seed.json'), manifest([{ ...APP, icon: { src: 'missing.png', alt: 'Missing' } }]));
  await assert.rejects(buildSite(config), /missing\.png/);
  assert.deepEqual(await fingerprint(output), first);

  await writeFile(join(root, 'catalogue/seed.json'), manifest([APP]));
  await buildSite(config);
  assert.equal(await exists(join(output, 'apps/removed')), false);
  assert.equal(await exists(join(output, 'assets/media')), false);
});

test('check writes no output and missing configured sources are actionable failures', async (t) => {
  const { config, output, root } = await fixture(t, { 'catalogue/seed.json': manifest([APP]) });
  await buildSite(config, {}, BuildMode.CHECK);
  assert.equal(await exists(output), false);

  await rm(join(root, 'repos'), { recursive: true });
  await assert.rejects(buildSite(config), /ENOENT.*repos/);
});

test('refuses unrelated output, input ancestors, and output symlinks', async (t) => {
  const { config, output, root } = await fixture(t, { 'catalogue/seed.json': manifest([APP]), 'dist/user.txt': 'keep me' });
  await assert.rejects(buildSite(config), /unowned directory/);
  assert.equal(await readFile(join(output, 'user.txt'), 'utf8'), 'keep me');
  await assert.rejects(buildSite(config, { output: '.' }), /replace an input directory/);
  await assert.rejects(buildSite(config, { output: '.' }, BuildMode.CHECK), /replace an input directory/);

  await rm(output, { recursive: true });
  await mkdir(join(root, 'actual'));
  await symlink(join(root, 'actual'), output);
  await assert.rejects(buildSite(config), /regular directory/);
});

test('output checks protect input ancestors reached through an aliased parent', async (t) => {
  const { config, root } = await fixture(t, {
    'inputs/app.json': manifest([APP]),
    'inputs/.apps-site': 'apps-site output v1\n',
  }, { catalogues: ['inputs'], output: 'alias/inputs' });
  await symlink(root, join(root, 'alias'));
  await assert.rejects(buildSite(config), /replace an input directory/);
  assert.equal(await exists(join(root, 'inputs/app.json')), true);
});

test('output cannot be nested inside a recursively scanned catalogue', async (t) => {
  const { config } = await fixture(t, { 'catalogue/app.json': manifest([APP]) }, { output: 'catalogue/generated' });
  await assert.rejects(buildSite(config), /Output overlaps a catalogue/);
});

test('renders text as text, retains remote media without fetching, and supports an empty directory', async (t) => {
  const unsafe = { ...APP, name: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>', screenshots: [{ src: 'https://images.example.org/screen.png', alt: 'A "quoted" screenshot' }] };
  const { config, output, root } = await fixture(t, { 'catalogue/app.json': manifest([unsafe]) });
  await buildSite(config);
  const page = await readFile(join(output, 'apps/sample/index.html'), 'utf8');
  assert.doesNotMatch(page, /<script>|<img src=x/);
  assert.match(page, /&lt;script&gt;/);
  assert.match(page, /https:\/\/images\.example\.org\/screen.png/);

  await rm(join(root, 'catalogue/app.json'));
  await buildSite(config);
  assert.match(await readFile(join(output, 'index.html'), 'utf8'), /no entries yet/);
});

test('CLI check validates without output and reports invalid commands and configuration', async (t) => {
  const { config, output } = await fixture(t, { 'catalogue/app.json': manifest([APP]) });
  const { stdout } = await exec(process.execPath, [CLI, 'check', '--config', config]);
  assert.match(stdout, /Valid: 1 apps/);
  assert.equal(await exists(output), false);
  await assert.rejects(exec(process.execPath, [CLI, 'wrong']), (error) => error.code === 1 && /Usage/.test(error.stderr));
  await assert.rejects(exec(process.execPath, [CLI, 'check', '--config', `${config}-missing`]), (error) => error.code === 1 && /ENOENT/.test(error.stderr));
});

test('preview serves nested static pages, rejects escapes and implements HEAD and method errors', async (t) => {
  const { config, output } = await fixture(t, { 'catalogue/app.json': manifest([APP]) });
  await buildSite(config);
  const server = await startPreview(output, { port: 0 });
  t.after(() => new Promise((accept) => server.close(accept)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const detail = await fetch(`${base}/apps/sample/`);
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /Sample/);
  const redirect = await fetch(`${base}/apps/sample?q=keep`, { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/apps/sample/?q=keep');
  const head = await fetch(`${base}/assets/style.css`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/.apps-site`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e%2fsite.json`)).status, 404);
  assert.equal((await fetch(`${base}/%zz`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
