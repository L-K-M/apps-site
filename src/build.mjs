import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { collectApps, loadConfig } from './catalogue.mjs';
import { prepareMedia } from './media.mjs';
import { publishSite, validateOutput } from './output.mjs';
import { renderSite } from './render.mjs';

export const BuildMode = Object.freeze({ CHECK: 'check', WRITE: 'build' });
const PUBLIC_ASSETS = [
  'style.css', 'directory.js', 'favicon.svg',
  'fonts/syne-variable.woff2', 'fonts/instrument-sans-variable.woff2',
  'fonts/OFL-syne.txt', 'fonts/OFL-instrument-sans.txt',
];

export async function buildSite(configPath, overrides = {}, mode = BuildMode.WRITE) {
  const config = await loadConfig(configPath, overrides);
  const collected = await collectApps(config);
  const { apps, assets } = await prepareMedia(collected);
  const protectedPaths = [dirname(config.configFile), ...config.catalogues, ...config.repositoryRoots, ...apps.map((app) => app.source.root)];
  await validateOutput(config.output, protectedPaths, config.catalogues);
  if (mode === BuildMode.CHECK) return { config, apps };

  const files = renderSite(config, apps);
  for (const name of PUBLIC_ASSETS) files.set(`assets/${name}`, await readFile(new URL(`../public/${name}`, import.meta.url)));
  for (const [name, bytes] of assets) files.set(name, bytes);

  await publishSite(config.output, files, protectedPaths, config.catalogues);
  return { config, apps };
}
