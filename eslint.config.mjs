import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { files: ['public/*.js', 'e2e/*.mjs'], languageOptions: { globals: globals.browser } },
];
