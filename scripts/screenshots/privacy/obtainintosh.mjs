/* global window */

// Capture the actual frontend with IPC replaced before boot. Every app is invented.
import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'node:url';
const destination = fileURLToPath(new URL('../../../catalogue/assets/obtainintosh.png', import.meta.url));
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1100, height: 560}, deviceScaleFactor: 2});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    const now = '2026-10-28T10:00:00Z';
    const apps = [
      ['demo-notes', 'Example Notes', '1.4.0', '1.5.0'],
      ['demo-editor', 'Example Editor', '3.2.1', '3.2.1'],
      ['demo-draw', 'Example Canvas', '2.0.0', '2.1.0'],
      ['demo-music', 'Example Player', '4.3.0', '4.3.0'],
      ['demo-archive', 'Example Archive', '1.0.2', '1.1.0']
    ].map(([id, name, current_version, latest_version]) => ({id, name, current_version, latest_version,
      source_type: 'forgejo', source_url: `https://code.example.com/demo/${id}`, asset_filter: null,
      install_path: `/Applications/${name}.app`, last_checked: now,
      last_check_attempt: {attempted_at: now, state: 'succeeded', message: null},
      downloaded: null, username: null, access_token: null}));
    let callback = 0;
    window.__TAURI_INTERNALS__ = {
      metadata: {currentWindow: {label: 'main'}, currentWebview: {label: 'main'}},
      transformCallback() { return ++callback; },
      unregisterCallback() {},
      async invoke(command) {
        if (command === 'get_all_apps') return apps;
        if (command === 'check_for_updates') return apps.map(a => ({appId: a.id, appName: a.name, state: 'succeeded', message: null}));
        if (command === 'get_system_colors') return {accent_color: null, accent_text_color: null, highlight_color: null, highlight_text_color: null};
        if (command === 'is_window_active') return true;
        if (command === 'check_self_update') return null;
        if (command === 'plugin:event|listen') return ++callback;
        if (command.startsWith('plugin:event|') || command.startsWith('plugin:window|')) return null;
        throw Error(`Unexpected IPC during screenshot: ${command}`);
      }
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener() {}};
  });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5187/', {waitUntil: 'networkidle'});
  await page.getByText('Example Notes', {exact: true}).waitFor();
  await page.screenshot({path: destination});
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser.close();
}
