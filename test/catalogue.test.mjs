import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectApps, loadConfig } from '../src/catalogue.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const AUDITED_REPOSITORY_COUNT = 68;
const CATALOGUE_APP_COUNT = 64;
const HAUNTWARE_APP_IDS = ['planchette', 'poltergeist', 'seance'];
const HAUNTWARE_SOURCE = 'https://github.com/L-K-M/Hauntware';

test('the public repository audit accounts for every catalogue entry and excluded repo', async () => {
  const inventory = JSON.parse(await readFile(join(ROOT, 'docs/public-repositories.json'), 'utf8'));
  const config = await loadConfig(join(ROOT, 'site.json'));
  // Audit the committed catalogue independently of other local working trees.
  const apps = await collectApps({ ...config, repositoryRoots: [] });
  const byId = new Map(apps.map((app) => [app.id, app]));
  const names = new Set(inventory.repositories.map((repo) => repo.name));
  assert.equal(names.size, AUDITED_REPOSITORY_COUNT);
  assert.equal(inventory.repositories.length, names.size);
  assert.equal(apps.length, CATALOGUE_APP_COUNT);
  const accounted = new Set(inventory.standaloneApps);

  for (const repo of inventory.repositories) {
    assert.ok(Boolean(repo.apps?.length) !== Boolean(repo.excluded), `${repo.name}: needs one inclusion or exclusion decision`);
    for (const id of repo.apps ?? []) {
      const app = byId.get(id);
      assert.ok(app, `${repo.name}: missing ${id}`);
      accounted.add(id);
      if (repo.name !== 'Hauntware') assert.equal(app.links.source, `https://github.com/L-K-M/${repo.name}`);
    }
  }

  assert.deepEqual([...accounted].sort(), [...byId.keys()].sort());
  for (const id of inventory.excludedPrivateApps) assert.equal(byId.has(id), false);
  for (const id of ['dwindle', 'qrat']) assert.equal(byId.get(id).links.source, undefined);
});

test('Hauntware is one manifest with three distinct searchable apps', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, 'catalogue/hauntware.json'), 'utf8'));
  assert.equal(manifest.repository, HAUNTWARE_SOURCE);
  assert.deepEqual(manifest.apps.map((app) => app.id).sort(), HAUNTWARE_APP_IDS);
  for (const app of manifest.apps) assert.ok(app.tags.includes('Hauntware'));
});

test('the Hauntware repo-ready manifest resolves each app root and overrides central entries', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hauntware-metadata-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repos/Hauntware');
  const central = join(root, 'catalogue');
  const manifest = JSON.parse(await readFile(join(ROOT, 'examples/hauntware.json'), 'utf8'));
  await mkdir(repo, { recursive: true });
  await mkdir(central);
  await writeFile(join(repo, 'app-directory.json'), JSON.stringify(manifest));
  await writeFile(join(central, 'seed.json'), JSON.stringify({ schemaVersion: 1, apps: manifest.apps.map((app) => ({ id: app.id, name: `Fallback ${app.name}`, summary: app.summary, category: app.category, platforms: [] })) }));

  for (const app of manifest.apps) {
    const appRoot = join(repo, app.path);
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'pubspec.yaml'), 'name: fixture\ndependencies:\n  flutter:\n    sdk: flutter\n');
    const entry = app.id === 'planchette' ? 'linux/CMakeLists.txt' : 'android/app/src/main/AndroidManifest.xml';
    await mkdir(dirname(join(appRoot, entry)), { recursive: true });
    await writeFile(join(appRoot, entry), 'fixture');
  }

  const apps = await collectApps({ repositoryRoots: [join(root, 'repos')], catalogues: [central] });
  assert.equal(apps.length, HAUNTWARE_APP_IDS.length);
  for (const app of apps) {
    assert.equal(app.links.source, HAUNTWARE_SOURCE);
    assert.equal(app.source.tier, 'repository');
    assert.equal(app.platformsInferred, true);
    assert.deepEqual(app.platforms, [app.id === 'planchette' ? 'linux' : 'android']);
    assert.equal(app.name.startsWith('Fallback '), false);
  }
});
