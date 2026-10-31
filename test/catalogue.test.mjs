import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectApps, loadConfig } from '../src/catalogue.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const AUDITED_REPOSITORY_COUNT = 80;
const CATALOGUE_APP_COUNT = 77;
const HAUNTWARE_APP_IDS = ['planchette', 'poltergeist', 'seance'];
const HAUNTWARE_SOURCE = 'https://github.com/L-K-M/Hauntware';
const HAUNTWARE_DOWNLOAD = `${HAUNTWARE_SOURCE}/releases/latest`;
const ARCHIVED_STANDALONE_REPOSITORIES = /github\.com\/L-K-M\/(?:Seance|Poltergeist|Planchette)(?:[/?#]|$)/;
const MATURITY_LEVELS = new Set(['experimental', 'usable', 'polished']);

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
      if (repo.name !== 'Hauntware') {
        const repository = repo.sourceRepository ?? repo.name;
        const path = repo.sourcePath ? `/tree/main/${repo.sourcePath}` : '';
        assert.equal(app.links.source, `https://github.com/L-K-M/${repository}${path}`);
      }
    }
  }

  for (const app of apps) {
    for (const url of Object.values(app.links ?? {})) {
      assert.equal(ARCHIVED_STANDALONE_REPOSITORIES.test(url), false, `${app.id}: archived standalone repository link ${url}`);
    }
  }

  assert.deepEqual([...accounted].sort(), [...byId.keys()].sort());
  for (const id of inventory.excludedPrivateApps) assert.equal(byId.has(id), false);
  for (const id of ['bookfeed', 'dwindle', 'leaflit', 'qrat']) assert.equal(byId.get(id).links.source, undefined);
  assert.equal(byId.get('bookfeed').links.website, 'https://bookfeed.io/');
  assert.equal(byId.get('leaflit').links.website, 'https://leafl.it/');
});

test('Hauntware is one manifest with three distinct searchable apps', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, 'catalogue/hauntware.json'), 'utf8'));
  assert.equal(manifest.repository, HAUNTWARE_SOURCE);
  assert.deepEqual(manifest.apps.map((app) => app.id).sort(), HAUNTWARE_APP_IDS);
  for (const app of manifest.apps) {
    assert.ok(app.tags.includes('Hauntware'));
    assert.equal(app.links.source, `${HAUNTWARE_SOURCE}/tree/main/${app.id}`);
    assert.equal(app.links.download, HAUNTWARE_DOWNLOAD);
    assert.ok(app.links.docs.startsWith(`${HAUNTWARE_SOURCE}/blob/main/${app.id}/`));
  }
});

test('curated apps have explained maturity ratings', async () => {
  const config = await loadConfig(join(ROOT, 'site.json'));
  const apps = await collectApps({ ...config, repositoryRoots: [] });
  for (const app of apps) {
    assert.ok(MATURITY_LEVELS.has(app.maturity), `${app.id}: missing maturity rating`);
    assert.ok(app.maturityNote?.trim(), `${app.id}: missing rating explanation`);
  }
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
    assert.equal(app.links.source, `${HAUNTWARE_SOURCE}/tree/main/${app.id}`);
    assert.equal(app.links.download, HAUNTWARE_DOWNLOAD);
    assert.equal(app.source.tier, 'repository');
    assert.equal(app.platformsInferred, true);
    assert.deepEqual(app.platforms, [app.id === 'planchette' ? 'linux' : 'android']);
    assert.equal(app.name.startsWith('Fallback '), false);
  }
});

test('published Mac apps have local screenshots covered by the privacy audit', async () => {
  const config = await loadConfig(join(ROOT, 'site.json'));
  const apps = await collectApps({ ...config, repositoryRoots: [] });
  const macApps = apps.filter((app) => app.status === 'visible' && app.platforms.includes('macos'));
  for (const app of macApps) assert.ok(app.screenshots.length, `${app.id}: missing Mac screenshot`);

  const audit = JSON.parse(await readFile(join(ROOT, 'docs/macos-screenshots.json'), 'utf8'));
  for (const app of macApps) {
    for (const screenshot of app.screenshots) {
      assert.ok(screenshot.src.startsWith('assets/'), `${app.id}: screenshot must be local`);
      const record = audit.screenshots[screenshot.src];
      assert.ok(record, `${app.id}: missing screenshot privacy review`);
      assert.ok(record.syntheticData?.trim(), `${app.id}: explain the synthetic data`);
      assert.ok(record.source?.trim(), `${app.id}: document the capture source`);
      const bytes = await readFile(join(app.source.root, screenshot.src));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256,
        `${app.id}: screenshot changed; review its pixels and update the audit`);
    }
  }
});
