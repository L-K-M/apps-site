import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import lockfile from 'proper-lockfile';
import { canonicalPath, exists, isWithin } from './paths.mjs';

const OUTPUT_MARKER = '.apps-site';
const OUTPUT_SIGNATURE = 'apps-site output v1\n';
const LOCK_STALE_SECONDS = 30;
const LOCK_STALE_MS = LOCK_STALE_SECONDS * 1000;
const LOCK_HEARTBEAT_MS = 10000;

export async function validateOutput(output, protectedPaths, catalogues = []) {
  const canonicalOutput = await canonicalPath(output);
  for (const path of protectedPaths) {
    if (isWithin(canonicalOutput, await canonicalPath(path))) throw new Error(`Output would replace an input directory: ${output}`);
  }

  for (const catalogue of catalogues) {
    if (isWithin(await canonicalPath(catalogue), canonicalOutput)) throw new Error(`Output overlaps a catalogue source: ${output}`);
  }

  if (!await exists(output)) return;
  const info = await lstat(output);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Output must be a regular directory: ${output}`);
  if ((await readdir(output)).length === 0) return;

  const marker = join(output, OUTPUT_MARKER);
  if (await exists(marker) && await readFile(marker, 'utf8') === OUTPUT_SIGNATURE) return;
  throw new Error(`Refusing to replace an unowned directory: ${output}. Choose an empty output directory.`);
}

export async function publishSite(output, files, protectedPaths, catalogues = []) {
  await validateOutput(output, protectedPaths, catalogues);
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });

  const lockPath = join(parent, `.${basename(output)}.apps-site.lock`);
  let release;
  try {
    // A heartbeat lease recovers after crashes, including across containers.
    release = await lockfile.lock(output, { realpath: false, lockfilePath: lockPath, stale: LOCK_STALE_MS, update: LOCK_HEARTBEAT_MS });
  } catch (error) {
    if (error.code === 'ELOCKED') throw new Error(`Another build owns ${lockPath}. Retry in ${LOCK_STALE_SECONDS} seconds if that build has stopped.`, { cause: error });
    throw error;
  }

  let staging;
  let previous;
  let published = false;
  try {
    await validateOutput(output, protectedPaths, catalogues);
    staging = await mkdtemp(join(parent, `.${basename(output)}.apps-site-`));
    for (const [path, content] of files) {
      const target = join(staging, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    await writeFile(join(staging, OUTPUT_MARKER), OUTPUT_SIGNATURE);

    // Publish only a complete build, retaining the last output for rollback.
    if (await exists(output)) {
      previous = `${staging}-previous`;
      await rename(output, previous);
    }

    try {
      await rename(staging, output);
      published = true;
    } catch (error) {
      try {
        if (previous) await rename(previous, output);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Could not restore output: ${rollbackError.message}. Last successful build retained at ${previous}`, { cause: rollbackError });
      }
      previous = undefined;
      throw error;
    }
  } finally {
    try {
      if (staging) await rm(staging, { recursive: true, force: true });
      if (previous && published) await rm(previous, { recursive: true, force: true });
    } finally {
      await release();
    }
  }
}
