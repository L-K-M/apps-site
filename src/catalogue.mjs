import { execFile } from 'node:child_process';
import { readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { detectPlatforms } from './platforms.mjs';
import { exists, isWithin, resolveInside } from './paths.mjs';
import { isWebUrl, readJson, validate } from './validation.mjs';

const MANIFEST_NAME = 'app-directory.json';
const exec = promisify(execFile);
export const AppVisibility = Object.freeze({ VISIBLE: 'visible', HIDDEN: 'hidden' });

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
  const hasVisibleApps = manifest.apps.some((app) => (app.status ?? AppVisibility.VISIBLE) === AppVisibility.VISIBLE);
  const repository = manifest.repository ?? (tier === 'repository' && hasVisibleApps ? await sourceUrl(root) : undefined);
  const apps = [];

  for (const app of manifest.apps) {
    const status = app.status ?? AppVisibility.VISIBLE;
    apps.push({
      ...app,
      status,
      maturity: app.maturity ?? null,
      links: { ...(repository ? { source: repository } : {}), ...app.links },
      screenshots: app.screenshots ?? [],
      tags: app.tags ?? [],
      features: app.features ?? [],
      source: { file, root, tier },
    });
  }

  return apps;
}

async function resolveAppSource(app) {
  const root = app.source.root;
  const declaredRoot = resolve(root, app.path ?? '.');
  if (!isWithin(root, declaredRoot)) throw new Error(`Path escapes its source directory: ${app.path}`);

  // Protect declared hidden sources from output replacement without requiring their files.
  const appRoot = app.status === AppVisibility.HIDDEN ? declaredRoot : await resolveInside(root, app.path ?? '.');
  const inferred = app.status === AppVisibility.VISIBLE && app.platforms === undefined && app.source.tier === 'repository';
  const platforms = inferred ? await detectPlatforms(appRoot) : app.platforms ?? [];
  return { ...app, platforms: [...platforms].sort(), platformsInferred: inferred && platforms.length > 0, source: { ...app.source, root: appRoot } };
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
  const apps = [];
  for (const app of catalogue.values()) apps.push(await resolveAppSource(app));
  return apps.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en'));
}
