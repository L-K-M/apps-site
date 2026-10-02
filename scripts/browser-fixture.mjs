import { resolve } from 'node:path';
import { buildSite } from '../src/build.mjs';
import { startPreview } from '../src/preview.mjs';

// Serve under a subdirectory to catch accidental root-relative asset links.
await buildSite('site.json', { output: resolve('test-results/site/catalogue') });
const server = await startPreview(resolve('test-results/site'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
