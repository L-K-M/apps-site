import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function canonicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return join(await canonicalPath(dirname(path)), basename(path));
  }
}

export async function resolveInside(root, path) {
  const resolved = resolve(root, path);
  if (!isWithin(root, resolved)) throw new Error(`Path escapes its source directory: ${path}`);

  // Check real paths too: a symlink must not publish files outside the app.
  const [realRoot, realResolved] = await Promise.all([realpath(root), realpath(resolved)]);
  if (!isWithin(realRoot, realResolved)) throw new Error(`Symlink escapes its source directory: ${path}`);

  return realResolved;
}
