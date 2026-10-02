import { createServer, STATUS_CODES } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { isWithin, resolveInside } from './paths.mjs';

const HTTP = Object.freeze({ OK: 200, MOVED_PERMANENTLY: 301, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405, INTERNAL_ERROR: 500 });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
};

function respond(response, code) {
  response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(STATUS_CODES[code]);
}

export async function startPreview(root, { host = '127.0.0.1', port = 4173 } = {}) {
  if (!(await stat(root)).isDirectory()) throw new Error(`Build the site before previewing: ${root}`);

  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return respond(response, HTTP.METHOD_NOT_ALLOWED);
    }

    try {
      const url = new URL(request.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (path.split('/').some((part) => part.startsWith('.')) || !isWithin(root, resolve(root, `.${path}`))) {
        return respond(response, HTTP.NOT_FOUND);
      }

      let target = await resolveInside(root, `.${path}`);
      if ((await stat(target)).isDirectory()) {
        if (!url.pathname.endsWith('/')) {
          response.writeHead(HTTP.MOVED_PERMANENTLY, { Location: `${url.pathname}/${url.search}` });
          return response.end();
        }
        target = await resolveInside(root, join(`.${path}`, 'index.html'));
      }
      const bytes = await readFile(target);
      response.writeHead(HTTP.OK, {
        'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
        'Content-Length': bytes.length,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      const missing = ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) || error instanceof URIError || /escapes its source/.test(error.message);
      respond(response, missing ? HTTP.NOT_FOUND : HTTP.INTERNAL_ERROR);
    }
  });

  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, accept);
  });
  return server;
}
