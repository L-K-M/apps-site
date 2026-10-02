import { execFile } from 'node:child_process';
import { readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { detectPlatforms } from './platforms.mjs';
import { exists, resolveInside } from './paths.mjs';
import { isWebUrl, readJson, validate } from './validation.mjs';

const MANIFEST_NAME = 'app-directory.json';
const exec = promisify(execFile);

export async function loadConfig(file, overrides = {}) {
  const configFile = resolve(file);
  const config = validate(await readJson(configFile), 'configuration', configFile);
  const root = dirname(configFile);

  return {
    ...config,
    repositoryRoots: [...config.repositoryRoots, ...(overrides.repositoryRoots ?? [])].map((path) => resolve(root, path)),
    catalogues: config.catalogues.map((path) => resolve(root, path)),
    output: resolve(root, overrides.output ?? config.output),
    configFile,
  };
}

async function centralFiles(path, visited = new Set()) {
  const real = await realpath(path);
  if (visited.has(real)) return [];
  visited.add(real);
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const child = join(path, entry.name);
    const info = entry.isSymbolicLink() ? await stat(child) : entry;
    if (info.isDirectory()) files.push(...await centralFiles(child, visited));
    if (info.isFile() && entry.name.endsWith('.json')) files.push(await realpath(child));
  }

  return files;
}

async function repositoryFiles(roots) {
  const files = new Set();

  for (const root of roots) {
    // Each root may itself be a repo, or a workspace containing repos.
    const ownManifest = join(root, MANIFEST_NAME);
    if (await exists(ownManifest)) files.add(await realpath(ownManifest));

    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const child = join(root, entry.name);
      const info = entry.isSymbolicLink() ? await stat(child) : entry;
      if (!info.isDirectory()) continue;

      const manifest = join(child, MANIFEST_NAME);
      if (await exists(manifest)) files.add(await realpath(manifest));
    }
  }

  return [...files].sort();
}

async function sourceUrl(root) {
  if (!await exists(join(root, '.git'))) return undefined;

  try {
    // Trust only this read-only source, including differently owned Docker mounts.
    const { stdout } = await exec('git', ['-c', `safe.directory=${root}`, '-C', root, 'config', '--local', '--get', 'remote.origin.url']);
    const remote = stdout.trim().replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
    return isWebUrl(remote) ? remote : undefined;
  } catch (error) {
    if (error.code === 1 || error.code === 'ENOENT') return undefined;
    throw new Error(`${root}: cannot read repository origin`, { cause: error });
  }
}

async function readManifest(file, tier) {
  const manifest = validate(await readJson(file), 'manifest', file);
  const root = dirname(file);
  const repository = manifest.repository ?? (tier === 'repository' ? await sourceUrl(root) : undefined);
  const apps = [];

  for (const app of manifest.apps) {
    const appRoot = await resolveInside(root, app.path ?? '.');
    const inferred = app.platforms === undefined && tier === 'repository';
    const platforms = inferred ? await detectPlatforms(appRoot) : app.platforms ?? [];

    apps.push({
      ...app,
      platforms: [...platforms].sort(),
      platformsInferred: inferred && platforms.length > 0,
      maturity: app.maturity ?? null,
      links: { ...(repository ? { source: repository } : {}), ...app.links },
      screenshots: app.screenshots ?? [],
      tags: app.tags ?? [],
      features: app.features ?? [],
      source: { file, root: appRoot, tier },
    });
  }

  return apps;
}

async function loadTier(files, tier) {
  const entries = new Map();

  for (const file of files) {
    for (const app of await readManifest(file, tier)) {
      const previous = entries.get(app.id);
      if (previous) throw new Error(`Duplicate app id "${app.id}": ${previous.source.file} and ${file}`);
      entries.set(app.id, app);
    }
  }

  return entries;
}

export async function collectApps(config) {
  const central = [];
  for (const path of config.catalogues) {
    if (path.endsWith('.json')) central.push(await realpath(path));
    else central.push(...await centralFiles(path));
  }

  const catalogue = await loadTier([...new Set(central)].sort(), 'catalogue');
  const repositories = await loadTier(await repositoryFiles(config.repositoryRoots), 'repository');

  // Repo-local metadata becomes authoritative as apps adopt the manifest.
  for (const [id, app] of repositories) catalogue.set(id, app);
  return [...catalogue.values()].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en'));
}
