// Render the unchanged Earnest web client with invented, in-memory API data.
// Usage: node scripts/screenshots/capture-earnest.mjs /path/to/Earnest/web/dist [output.png]
// Rebuild the pinned public client with capture-earnest.py first.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dist = resolve(process.argv[2]);
const output = process.argv[3] ?? fileURLToPath(new URL('../../catalogue/assets/earnest.png', import.meta.url));
const origin = 'http://127.0.0.1:47891';
const time = '2026-11-16T12:00:00Z';
const subscriptions = [
  { id: 1, feed_id: 1, title: 'Example Engineering', url: 'https://engineering.example.test/feed', deleted: false },
  { id: 2, feed_id: 2, title: 'Sample Notebook', url: 'https://notebook.example.test/feed', deleted: false },
  { id: 3, feed_id: 3, title: 'Example Archives', url: 'https://archives.example.test/feed', deleted: false },
];
const register = (value) => ({ value, rev: 1, actor: 1, occurred_at: time, source: 'fixture' });
const titles = ['Making a small tool useful', 'Notes from a fictional reading queue',
  'A guide to keeping a sample archive', 'What we learned from a paper prototype',
  'An afternoon with a new idea'];
const entries = titles.map((title, index) => ({
  id: index + 1, seq: index + 1, subscription_id: index % 3 + 1, feed_id: index % 3 + 1,
  title, url: `https://example.test/articles/${index + 1}`, published_at: time,
  deleted: false, blurb: 'An invented article for this catalogue screenshot.',
  state: { principal: 1, entry_id: index + 1, state_rev: 1,
    seen: register('unseen'), shelf: register('none'), kept: register(false) },
}));
const stories = entries.map((entry) => ({
  id: `entry:${entry.id}`, entry, source_title: subscriptions[entry.subscription_id - 1].title,
  published_at: time, feed_count: 1,
  excerpt: 'A sample excerpt about making, reading and organizing things. No real feed or account is connected.',
  coverage: [{ entry, source_title: subscriptions[entry.subscription_id - 1].title }],
}));
const frontPage = { period: 'daily', window_start: '2026-11-15T12:00:00Z',
  window_end: time, selected_at: time, revision: 'catalogue-fixture',
  sections: [{ name: 'Across your feeds', stories: stories.slice(0, 2) },
    { name: 'More from the feeds', stories: stories.slice(2) }] };
const settings = { rev: 1, reading_mode: 'river', show_only_unread: false,
  today_decay_days: 2, single_key_shortcuts: true, theme: 'light', measure: 66,
  font: 'serif', feed_overrides: {} };

function api(path) {
  if (path === '/v1/me') return { user_id: 1, principal_id: 1 };
  if (path === '/v1/subscriptions') return subscriptions;
  if (path === '/v1/folders') return [];
  if (path === '/v1/labels') return [{ id: 1, name: 'Sample label', deleted: false }];
  if (path === '/v1/settings') return settings;
  if (path === '/v1/pipeline') return { blurb: 'disabled', ask: 'disabled', embed: 'disabled' };
  if (['/v1/saved-searches', '/v1/agents', '/v1/briefs/today', '/v1/notifications', '/v1/activity/agent-changes'].includes(path)) return [];
  if (path === '/v1/activity') return { items: [], has_more: false };
  if (path === '/v1/front-page') return frontPage;
  if (path === '/v1/bootstrap') return { generation: 'catalogue-fixture', rev: 0 };
  if (path.startsWith('/v1/bootstrap/')) return { items: [], has_more: false };
  if (path === '/v1/changes') return { changes: [], next: { generation: 'catalogue-fixture', rev: 0 }, has_more: false };
  if (path === '/v1/entries') return { entries, has_more: false };
  if (path.startsWith('/v1/positions')) return { seq: 0 };
  throw new Error(`Unexpected fixture API request: ${path}`);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light',
    reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    // Every request is fulfilled from fixtures or committed client assets.
    // No backend or even local HTTP server is started.
    if (url.origin !== origin) {
      errors.push(`External request blocked: ${url.origin}`);
      return route.abort();
    }
    try {
      if (url.pathname.startsWith('/v1/')) {
        assert.equal(route.request().method(), 'GET', 'The capture must not write API state');
        if (url.pathname === '/v1/events') return await route.fulfill({ body: '', contentType: 'text/event-stream' });
        return await route.fulfill({ json: api(url.pathname) });
      }
      const path = resolve(dist, url.pathname === '/front' || url.pathname === '/' ? 'index.html' : `.${url.pathname}`);
      assert.ok(path.startsWith(`${dist}${sep}`), 'Static asset must remain inside dist');
      return await route.fulfill({ body: await readFile(path), contentType: types[extname(path)] ?? 'application/octet-stream' });
    } catch (error) {
      errors.push(error.message);
      return route.abort();
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript("localStorage.setItem('earnest.csrf', 'catalogue-fixture-not-a-credential')");
  await page.goto(`${origin}/front`);
  await page.getByRole('heading', { name: titles[0], exact: true }).waitFor();
  await page.getByText('Sample Notebook', { exact: true }).first().waitFor();
  await page.evaluate('document.fonts.ready');
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: output, type: 'png', animations: 'disabled' });
  await context.close();
  console.log(`Captured Earnest with only synthetic API fixtures: ${output}`);
} finally {
  await browser.close();
}
