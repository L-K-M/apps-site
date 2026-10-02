#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { BuildMode, buildSite } from '../src/build.mjs';
import { loadConfig } from '../src/catalogue.mjs';
import { startPreview } from '../src/preview.mjs';

const MAX_PORT = 65535;
const HELP = `Usage: node bin/apps-site.mjs <build|check|preview> [options]

  build       Generate a static site, replacing only generator-owned output
  check       Validate metadata and media without writing output
  preview     Serve the last build locally

  --config    Site configuration (default: site.json)
  --output    Override output directory (relative to the configuration)
  --repos     Additional repo/workspace root; may be repeated
  --host      Preview interface (default: 127.0.0.1)
  --port      Preview port (default: 4173)
  --help, -h  Show this help
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'site.json' },
      output: { type: 'string' },
      repos: { type: 'string', multiple: true },
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '4173' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) return process.stdout.write(HELP);
  const command = positionals[0];
  if (positionals.length !== 1 || !['build', 'check', 'preview'].includes(command)) throw new Error(HELP);
  const overrides = { output: values.output, repositoryRoots: values.repos };

  if (command !== 'preview') {
    const { config, apps } = await buildSite(values.config, overrides, command === 'check' ? BuildMode.CHECK : BuildMode.WRITE);
    const message = command === 'check' ? `Valid: ${apps.length} apps` : `Built ${apps.length} apps → ${config.output}`;
    return process.stdout.write(`${message}\n`);
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) throw new Error(`Invalid port: ${values.port}`);

  const config = await loadConfig(values.config, overrides);
  const server = await startPreview(config.output, { host: values.host, port });
  process.stdout.write(`Preview: http://${values.host}:${port}\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}

main().catch((error) => {
  process.stderr.write(`apps-site: ${error.message}\n`);
  process.exitCode = 1;
});
