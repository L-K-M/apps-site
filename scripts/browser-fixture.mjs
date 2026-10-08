import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AppVisibility } from '../src/catalogue.mjs';
import { buildSite } from '../src/build.mjs';
import { startPreview } from '../src/preview.mjs';

// Exercise the full reference catalogue even when the owner hides apps for publication.
const input = resolve('test-results/browser-input');
await rm(input, { recursive: true, force: true });
await cp('catalogue', input, { recursive: true });
const inventory = JSON.parse(await readFile('docs/public-repositories.json', 'utf8'));
const referenceIds = new Set([...inventory.standaloneApps, ...inventory.repositories.flatMap((repo) => repo.apps ?? [])]);
for (const file of await readdir(input)) {
  if (!file.endsWith('.json')) continue;
  const path = join(input, file);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.apps = manifest.apps.filter((app) => referenceIds.has(app.id));
  if (!manifest.apps.length) {
    await rm(path);
    continue;
  }
  for (const app of manifest.apps) app.status = AppVisibility.VISIBLE;
  await writeFile(path, JSON.stringify(manifest));
}
await writeFile(join(input, 'hidden-fixture.json'), JSON.stringify({
  schemaVersion: 1,
  apps: [{ id: 'hidden-fixture', name: 'Hidden fixture app', summary: 'Private fixture metadata.', category: 'Hidden fixture category', status: AppVisibility.HIDDEN, path: 'missing/private/source', screenshots: [{ src: 'missing-private-image.png', alt: 'Hidden image' }] }],
}));

const config = JSON.parse(await readFile('site.json', 'utf8'));
const fixtureConfig = resolve('test-results/browser-site.json');
// The carnival's prize endpoint is never reached: browser tests answer it themselves.
const carnivalPrize = { name: 'Manors & Menaces', endpoint: 'https://play.example.org/api/giveaway', riddle: 'First the one in a sheet, then the one with nine lives.' };
await writeFile(fixtureConfig, JSON.stringify({ ...config, carnivalPrize, catalogues: [input], repositoryRoots: [], output: resolve('test-results/site/catalogue') }));
// Serve under a subdirectory to catch accidental root-relative asset links.
await buildSite(fixtureConfig);
const server = await startPreview(resolve('test-results/site'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
