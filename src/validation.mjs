import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';

const WEB_PROTOCOLS = new Set(['https:', 'http:']);
const validator = new Ajv({ allErrors: true, strict: true });

export function isWebUrl(value) {
  try {
    const url = new URL(value);
    return WEB_PROTOCOLS.has(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

validator.addFormat('web-url', isWebUrl);

const manifestSchema = await readJson(new URL('../schema/app-directory.schema.json', import.meta.url));
const configSchema = await readJson(new URL('../schema/site.schema.json', import.meta.url));
const validateManifest = validator.compile(manifestSchema);
const validateConfig = validator.compile(configSchema);

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`, { cause: error });
  }
}

export function validate(value, kind, file) {
  const check = kind === 'manifest' ? validateManifest : validateConfig;
  if (check(value)) return value;

  const details = check.errors.map((error) => {
    const property = error.params.additionalProperty ?? error.params.missingProperty;
    return `${error.instancePath || '/'}${property ? ` (${property})` : ''}: ${error.message}`;
  }).join('\n  ');

  throw new Error(`${file}: invalid ${kind}\n  ${details}`);
}
