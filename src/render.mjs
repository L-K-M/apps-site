const PLATFORMS = {
  macos: 'macOS', windows: 'Windows', linux: 'Linux', android: 'Android', ios: 'iOS', web: 'Web',
  firefox: 'Firefox', chrome: 'Chrome', pebble: 'Pebble', 'rg-nano': 'RG Nano',
};
const MATURITY = {
  experimental: 'Experimental',
  usable: 'Usable',
  polished: 'Polished',
};
const UNRATED_MATURITY = 'unrated';
const LINK_LABELS = { website: 'Open website', download: 'Downloads', source: 'Source code', docs: 'Documentation' };
const PLATFORM_SPRITE = 'assets/icons/platforms.svg';

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function maturity(app) {
  return MATURITY[app.maturity] ?? 'Not assessed';
}

function appStatus(app) {
  return `<span class="app-status" data-maturity="${escapeHtml(app.maturity ?? UNRATED_MATURITY)}">${escapeHtml(maturity(app))}</span>`;
}

function platformIcons(app, prefix = '') {
  if (!app.platforms.length) return 'Platform not specified';

  // Name each icon for assistive technology; titles also identify it on hover.
  const icons = app.platforms.map((platform) => {
    const label = escapeHtml(PLATFORMS[platform]);
    return `<svg class="platform-icon" viewBox="0 0 16 16" role="img" aria-label="${label}" focusable="false"><title>${label}</title><use href="${prefix}${PLATFORM_SPRITE}#${platform}"></use></svg>`;
  }).join('');

  return `<span class="platforms">${icons}</span>`;
}

function mediaUrl(src, prefix) {
  return src.startsWith('assets/') ? `${prefix}${src}` : src;
}

function appIcon(app, prefix) {
  if (!app.icon) return '';
  return `<img class="app-icon" src="${escapeHtml(mediaUrl(app.icon.src, prefix))}" alt="${escapeHtml(app.icon.alt)}" width="56" height="56" loading="lazy">`;
}

function canonical(config, path) {
  if (!config.url) return '';
  return new URL(path, `${config.url.replace(/\/$/, '')}/`).href;
}

function document(config, { title, description, content, prefix = '', path = '', scripts = '' }) {
  const url = canonical(config, path);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="color-scheme" content="light">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  ${url ? `<link rel="canonical" href="${escapeHtml(url)}"><meta property="og:url" content="${escapeHtml(url)}">` : ''}
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${prefix}assets/style.css">
  ${scripts}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="page">
    ${content}
  </div>
</body>
</html>
`;
}

function renderApp(app) {
  const preview = app.screenshots[0];
  const href = `apps/${app.id}/index.html`;
  const search = [app.name, app.summary, app.description ?? '', app.category, ...app.tags, ...app.features].join(' ');

  return `<li class="app-card" data-app data-search="${escapeHtml(search)}" data-category="${escapeHtml(app.category)}" data-platforms="${app.platforms.join(' ')}" data-maturity="${app.maturity ?? UNRATED_MATURITY}">
    <div class="card-heading">${appIcon(app, '')}<h2><a href="${href}">${escapeHtml(app.name)}</a></h2>${appStatus(app)}</div>
    <p class="app-summary">${escapeHtml(app.summary)}</p>
    <p class="app-meta">${platformIcons(app)}</p>
    ${preview ? `<a class="app-preview" href="${href}" aria-label="View ${escapeHtml(app.name)}"><img src="${escapeHtml(mediaUrl(preview.thumbnail ?? preview.src, ''))}" alt="${escapeHtml(preview.alt)}" loading="lazy" width="260" height="160"></a>` : ''}
  </li>`;
}

function options(values, label) {
  return `<option value="">${label}</option>${values.map(([value, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`).join('')}`;
}

function renderHome(config, apps) {
  const categories = [...new Set(apps.map((app) => app.category))].sort((a, b) => a.localeCompare(b, 'en'));
  const platforms = Object.entries(PLATFORMS).filter(([id]) => apps.some((app) => app.platforms.includes(id)));
  const content = `<header class="site-header">
    <h1 class="wordmark">${escapeHtml(config.title)}</h1>
    <div class="ornament" aria-hidden="true"><span></span></div>
  </header>
  <main id="main" class="directory-main" aria-label="App directory">
    <form class="filters" role="search" data-enhanced hidden>
      <input type="search" name="q" aria-label="Search apps" placeholder="Search apps" autocomplete="off">
      <select name="category" aria-label="Category">${options(categories.map((category) => [category, category]), 'All categories')}</select>
      <select name="platform" aria-label="Platform">${options(platforms, 'All platforms')}</select>
      <select name="maturity" aria-label="Maturity">${options([...Object.entries(MATURITY), [UNRATED_MATURITY, 'Not assessed']], 'All stages')}</select>
      <button type="reset">Clear</button>
    </form>
    <p class="result-count" data-result-count role="status" aria-live="polite">${apps.length} ${apps.length === 1 ? 'app' : 'apps'}</p>
    <ul class="app-grid">${apps.map(renderApp).join('')}</ul>
    <div class="empty-state" data-empty hidden><h2>No matching apps</h2><p>Try a different search or clear the filters.</p><button type="button" data-clear>Clear filters</button></div>
    ${apps.length ? '' : '<p class="catalogue-empty">The directory has no entries yet.</p>'}
  </main>`;

  return document(config, { title: config.title, description: config.description ?? config.title, content, scripts: '<script src="assets/directory.js" defer></script>' });
}

function renderDetail(config, app) {
  const prefix = '../../';
  const description = app.description ? app.description.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('') : '';
  const links = Object.entries(LINK_LABELS).filter(([key]) => app.links[key]).map(([key, label]) => `<a class="app-link" href="${escapeHtml(app.links[key])}">${label}<span aria-hidden="true">↗</span></a>`).join('');
  const gallery = app.screenshots.map((image) => {
    const url = escapeHtml(mediaUrl(image.src, prefix));
    return `<figure><a href="${url}" aria-label="View full-size screenshot: ${escapeHtml(image.alt)}"><img src="${url}" alt="${escapeHtml(image.alt)}" loading="lazy"></a>${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ''}</figure>`;
  }).join('');

  const content = `<main id="main" class="app-detail">
    <a class="back-link" href="${prefix}index.html">← All apps</a>
    <header class="detail-heading"><p class="category-label">${escapeHtml(app.category)}</p><div class="detail-title">${appIcon(app, prefix)}<h1>${escapeHtml(app.name)}</h1>${appStatus(app)}</div><p class="detail-summary">${escapeHtml(app.summary)}</p>${app.maturityNote ? `<p class="maturity-note">${escapeHtml(app.maturityNote)}</p>` : ''}</header>
    <div class="detail-layout">
      <aside class="detail-facts"><dl><dt>Platforms</dt><dd>${platformIcons(app, prefix)}${app.platformsInferred ? '<small>Inferred from build files.</small>' : ''}</dd>${app.tags.length ? `<dt>Topics</dt><dd>${app.tags.map(escapeHtml).join(', ')}</dd>` : ''}</dl><nav class="app-links" aria-label="${escapeHtml(app.name)} links">${links}</nav></aside>
      <div class="detail-body"><section class="description" aria-label="About ${escapeHtml(app.name)}">${description}</section>${app.features.length ? `<section class="features"><h2>What it does</h2><ul>${app.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul></section>` : ''}${gallery ? `<section class="gallery" aria-label="Screenshots">${gallery}</section>` : ''}</div>
    </div>
  </main>`;

  return document(config, { title: `${app.name} · ${config.title}`, description: app.summary, content, prefix, path: `apps/${app.id}/` });
}

export function publicCatalogue(apps) {
  return apps.map((app) => {
    const entry = { ...app };
    delete entry.source;
    delete entry.path;
    return entry;
  });
}

export function renderSite(config, apps) {
  const files = new Map([['index.html', renderHome(config, apps)]]);
  for (const app of apps) files.set(`apps/${app.id}/index.html`, renderDetail(config, app));
  files.set('apps.json', `${JSON.stringify({ schemaVersion: 1, apps: publicCatalogue(apps) }, null, 2)}\n`);

  if (config.url) {
    const paths = ['', ...apps.map((app) => `apps/${app.id}/`)];
    files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeHtml(canonical(config, path))}</loc></url>`).join('')}</urlset>\n`);
  }

  return files;
}
