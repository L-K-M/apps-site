import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import sharp from 'sharp';
import { resolveInside } from './paths.mjs';
import { isWebUrl } from './validation.mjs';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);
const MediaKind = Object.freeze({ ICON: 'icon', SCREENSHOT: 'screenshot' });
const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_HEIGHT = 400;
const THUMBNAIL_QUALITY = 82;

function storeImage(bytes, extension, assets) {
  const digest = createHash('sha256').update(bytes).digest('hex');
  const src = `assets/media/${digest}${extension}`;
  assets.set(src, bytes);
  return src;
}

async function prepareImage(image, source, assets, kind) {
  if (isWebUrl(image.src)) return image;
  if (/^[a-z][a-z\d+.-]*:/i.test(image.src) || image.src.startsWith('//')) {
    throw new Error(`${source.file}: image must be an HTTP(S) URL or local path: ${image.src}`);
  }

  const extension = extname(image.src).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error(`${source.file}: unsupported image format: ${image.src}`);

  let path;
  try {
    path = await resolveInside(source.root, image.src);
    if (!(await stat(path)).isFile()) throw new Error('not a file');
  } catch (error) {
    throw new Error(`${source.file}: cannot read image "${image.src}": ${error.message}`, { cause: error });
  }

  const bytes = await readFile(path);
  const src = storeImage(bytes, extension, assets);
  if (kind === MediaKind.ICON || extension === '.svg') return { ...image, src };

  // Directory rows load small previews; detail pages retain the original image.
  try {
    const preview = await sharp(bytes)
      .resize({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT, fit: sharp.fit.inside, withoutEnlargement: true })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toBuffer();
    return { ...image, src, thumbnail: storeImage(preview, '.webp', assets) };
  } catch (error) {
    throw new Error(`${source.file}: cannot process image "${image.src}": ${error.message}`, { cause: error });
  }
}

export async function prepareMedia(apps) {
  const assets = new Map();
  const prepared = [];

  for (const app of apps) {
    const icon = app.icon ? await prepareImage(app.icon, app.source, assets, MediaKind.ICON) : undefined;
    const screenshots = [];
    for (const image of app.screenshots) screenshots.push(await prepareImage(image, app.source, assets, MediaKind.SCREENSHOT));
    prepared.push({ ...app, icon, screenshots });
  }

  return { apps: prepared, assets };
}
