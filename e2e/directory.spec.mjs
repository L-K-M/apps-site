import { expect, test } from '@playwright/test';

test('renders all apps, local screenshots, and a responsive directory', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173') return route.abort();
    return route.continue();
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Apps by L-K-M', exact: true })).toBeVisible();
  await expect(page.locator('[data-app]:visible')).toHaveCount(17);
  await expect(page.locator('[data-result-count]')).toHaveText('17 apps');
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
  await expect(page.locator('[data-app]:visible')).toHaveCount(17);
  await expect(page.getByRole('searchbox')).toBeFocused();
});

test('detail pages and screenshots work under a subpath', async ({ page }) => {
  await page.goto('./?q=Dwindle');
  await page.getByRole('heading', { name: 'Dwindle', exact: true }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Dwindle', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open website' })).toHaveAttribute('href', 'https://dwindle.ch');
  await expect(page.getByRole('link', { name: 'Downloads' })).toHaveCount(0);
  await expect(page.locator('.gallery img')).toHaveCount(2);
  await expect.poll(() => page.locator('.gallery img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'All apps' }).click();
  await expect(page.locator('[data-app]:visible')).toHaveCount(17);
});

test('HTML remains usable with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('[data-app]')).toHaveCount(17);
  await expect(page.getByRole('searchbox')).toBeHidden();
  await page.getByRole('heading', { name: 'Jetty', exact: true }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Jetty', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Downloads' })).toBeVisible();
  await context.close();
});
