import { expect, test } from '@playwright/test';

const FONTS = { HEADINGS: 'Syne', TEXT: 'Instrument Sans' };
const FONT_CONTENT_TYPE = 'font/woff2';
const HTTP_OK = 200;
const WHITE_BACKGROUND = 'rgb(255, 255, 255)';
const STARTER_APP_COUNT = 64;

async function expectBundledFonts(page) {
  const typography = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      loaded: [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family.replace(/['"]/g, '')),
      heading: getComputedStyle(document.querySelector('h1, h2')).fontFamily,
      text: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(typography.loaded).toEqual(expect.arrayContaining(Object.values(FONTS)));
  expect(typography.heading).toContain(FONTS.HEADINGS);
  expect(typography.text).toContain(FONTS.TEXT);
}

test('renders all apps, local screenshots, and a responsive directory', async ({ page }, testInfo) => {
  const errors = [];
  const fontResponses = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'font') return;
    fontResponses.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] });
  });
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173') return route.abort();
    return route.continue();
  });

  await page.goto('./');
  await expectBundledFonts(page);
  expect(fontResponses).toHaveLength(2);
  for (const response of fontResponses) {
    expect(new URL(response.url).pathname).toMatch(/^\/catalogue\/assets\/fonts\//);
    expect(response.status).toBe(HTTP_OK);
    expect(response.type).toBe(FONT_CONTENT_TYPE);
  }
  await expect(page.getByRole('heading', { name: 'Apps by L-K-M', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(WHITE_BACKGROUND);
  const mirio = page.locator('[data-app]').filter({ has: page.getByRole('heading', { name: 'Mirio', exact: true }) });
  const name = mirio.getByRole('heading');
  const status = mirio.locator('.card-heading .app-status');
  await expect(status).toHaveText('Experimental');
  const nameBox = await name.boundingBox();
  const statusBox = await status.boundingBox();
  expect(statusBox.x).toBeGreaterThanOrEqual(nameBox.x + nameBox.width);
  await expect(page.locator('[data-app]:visible')).toHaveCount(STARTER_APP_COUNT);
  await expect(page.getByRole('heading', { name: 'Leaflit', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-result-count]')).toHaveText(`${STARTER_APP_COUNT} apps`);
  if (testInfo.project.name === 'desktop') {
    const first = await page.locator('[data-app]').nth(0).boundingBox();
    const second = await page.locator('[data-app]').nth(1).boundingBox();
    expect(first.y).toBe(second.y);
    expect(second.x).toBeGreaterThan(first.x);
  }
  for (const image of await page.locator('img').all()) await image.scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/directory-${testInfo.project.name}.png`, fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/preview-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});

test('combines search, category, platform and maturity; clears zero results', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('searchbox', { name: 'Search apps' }).fill('Mirio');
  await page.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('web');
  await page.getByRole('combobox', { name: 'Maturity', exact: true }).selectOption('experimental');

  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Games');

  await expect(page.locator('[data-app]:visible')).toHaveCount(1);
  await expect(page.locator('[data-result-count]')).toHaveText('1 app');
  expect(new URL(page.url()).searchParams.get('category')).toBe('Games');
  await page.reload();
  await expect(page.locator('[data-app]:visible')).toHaveCount(1);

  await page.getByRole('searchbox').fill('nothing-matches-this');
  await expect(page.getByRole('heading', { name: 'No matching apps' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('[data-app]:visible')).toHaveCount(STARTER_APP_COUNT);
  await expect(page.getByRole('searchbox')).toBeFocused();
});

test('finds all three Hauntware apps and browser/watch targets', async ({ page }) => {
  await page.goto('./?q=Hauntware');
  await expect(page.locator('[data-app]:visible')).toHaveCount(3);
  for (const name of ['Séance', 'Poltergeist', 'Planchette']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('pebble');
  await expect(page.locator('[data-app]:visible')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Game & Pebble', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('firefox');
  await expect(page.getByRole('heading', { name: 'Danvers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'RSS Spy', exact: true })).toBeVisible();
});

test('detail pages and screenshots work under a subpath', async ({ page }) => {
  await page.goto('./?q=Dwindle');
  await page.getByRole('heading', { name: 'Dwindle', exact: true }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Dwindle', exact: true })).toBeVisible();
  await expect(page.locator('.detail-title .app-status')).toHaveText('Not assessed');
  await expectBundledFonts(page);
  await expect(page.getByRole('link', { name: 'Open website' })).toHaveAttribute('href', 'https://dwindle.ch');
  await expect(page.getByRole('link', { name: 'Downloads' })).toHaveCount(0);
  await expect(page.locator('.gallery img')).toHaveCount(2);
  await expect.poll(() => page.locator('.gallery img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'All apps' }).click();
  await expect(page.locator('[data-app]:visible')).toHaveCount(STARTER_APP_COUNT);
});

test('HTML remains usable with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('[data-app]')).toHaveCount(STARTER_APP_COUNT);
  await expect(page.getByRole('searchbox')).toBeHidden();
  await page.getByRole('heading', { name: 'Jetty', exact: true }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Jetty', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Downloads' })).toBeVisible();
  await context.close();
});
