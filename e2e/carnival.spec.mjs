import { expect, test } from '@playwright/test';

// Monster greens (zombie, Frankenstein's monster, slime) are the band's
// densest clusters of --pixel-green; pumpkin stems add only single pixels.
const MONSTER_GREEN = [40, 120, 72];
const CLUSTER_RADIUS = 4;
const SETTLE_MS = 1000; // before the gargoyle's first visit, so nothing covers the band
const FRAME_MS = 500;
const FLEE_MS = 2500;
const GARGOYLE_ARRIVAL_MS = 4000;
const GARGOYLE_DART_MS = 3000;
const GARGOYLE_RETURN_MS = 16000;
const APP_PAGE = /^apps\/[^/]+\/index\.html$/;
const CLOCK_START = Date.parse('2026-10-31T20:00:00Z');
const NARROWER_PX = 100;
const RESIZE_SETTLE_MS = 500; // beyond the band's resize debounce
const MIN_TARGET_PX = 24; // WCAG 2.5.8 target size
const PAUSE_AFTER_LOAD_MS = 60000; // later than any page load, so the jump is forward

// Find the middles of green clusters on the band canvas, densest first and
// at least a monster apart, in band pixels and client coordinates.
function findMonsters(page) {
  return page.evaluate(([green, radius]) => {
    const canvas = document.querySelector('.carnival-scene');
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const isGreen = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const index = (y * width + x) * 4;
      return data[index] === green[0] && data[index + 1] === green[1] && data[index + 2] === green[2];
    };

    const candidates = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isGreen(x, y)) continue;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) count += isGreen(x + dx, y + dy);
        candidates.push({ x, y, count });
      }
    }

    const box = canvas.getBoundingClientRect();
    const clusters = [];
    for (const candidate of candidates.sort((a, b) => b.count - a.count)) {
      if (clusters.some((cluster) => Math.abs(cluster.x - candidate.x) < radius * 4)) continue;
      clusters.push({ ...candidate, clientX: box.left + ((candidate.x + 0.5) * box.width) / width, clientY: box.top + ((candidate.y + 0.5) * box.height) / height });
    }
    return clusters;
  }, [MONSTER_GREEN, CLUSTER_RADIUS]);
}

const findMonster = async (page) => (await findMonsters(page))[0] ?? null;

function greenAround(page, point) {
  return page.evaluate(([green, radius, { x, y }]) => {
    const canvas = document.querySelector('.carnival-scene');
    const { data } = canvas.getContext('2d').getImageData(x - radius, y - radius, radius * 2 + 1, radius * 2 + 1);
    let count = 0;
    for (let index = 0; index < data.length; index += 4) count += data[index] === green[0] && data[index + 1] === green[1] && data[index + 2] === green[2];
    return count;
  }, [MONSTER_GREEN, CLUSTER_RADIUS, point]);
}

const bandFrame = (page) => page.evaluate(() => document.querySelector('.carnival-scene').toDataURL());

async function poke(page, point, testInfo) {
  if (testInfo.project.name === 'mobile') await page.touchscreen.tap(point.clientX, point.clientY);
  else await page.mouse.click(point.clientX, point.clientY);
}

async function openCarnival(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: CLOCK_START });
  await page.goto('./');
  // Hold time still between steps, so monsters stay where they were found.
  await page.clock.pauseAt(CLOCK_START + PAUSE_AFTER_LOAD_MS);
  await page.locator('.carnival').scrollIntoViewIfNeeded();
  await page.clock.runFor(SETTLE_MS);
  return errors;
}

test('a scared monster runs off and drops a ticket to an app', async ({ page }, testInfo) => {
  const errors = await openCarnival(page);
  const band = page.locator('.carnival');
  await expect(band).toBeVisible();
  const before = await bandFrame(page);
  await page.clock.runFor(FRAME_MS);
  expect(await bandFrame(page)).not.toBe(before);

  const monster = await findMonster(page);
  expect(monster).not.toBeNull();
  const ticket = page.getByRole('dialog', { name: 'Carnival ticket' });

  // A touch that turns into a scroll is cancelled, never clicked: no scare.
  const press = { bubbles: true, pointerType: 'touch', clientX: monster.clientX, clientY: monster.clientY };
  await page.locator('.carnival-scene').dispatchEvent('pointerdown', press);
  await page.locator('.carnival-scene').dispatchEvent('pointercancel', press);
  await expect(ticket).toHaveCount(0);

  await poke(page, monster, testInfo);
  await expect(ticket).toBeVisible();
  await expect(ticket).toBeFocused();

  // The ticket names a real app from the directory.
  const link = ticket.getByRole('link');
  const href = await link.getAttribute('href');
  expect(href).toMatch(APP_PAGE);
  await expect(page.locator(`[data-app] h2 a[href="${href}"]`)).toHaveText((await link.textContent()) ?? '');

  // The ground stays clear of the ticket, and the monster leaves its spot.
  const ticketBox = await ticket.boundingBox();
  expect(ticketBox.y + ticketBox.height).toBeLessThan(monster.clientY);
  await page.clock.runFor(FLEE_MS);
  expect(await greenAround(page, monster)).toBeLessThan(monster.count / 2);

  await page.keyboard.press('Escape');
  await expect(ticket).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // A narrower viewport redraws the band at its new width.
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width - NARROWER_PX, height: viewport.height });
  await page.clock.runFor(RESIZE_SETTLE_MS);
  expect(await page.evaluate(() => {
    const scene = document.querySelector('.carnival-scene');
    return scene.width === Math.ceil(scene.clientWidth / 2);
  })).toBe(true);
  await page.setViewportSize(viewport);
  await page.clock.runFor(RESIZE_SETTLE_MS);
  await band.screenshot({ path: `test-results/carnival-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});

test('keyboard users scare monsters with a button and reach the ticket', async ({ page }) => {
  const errors = await openCarnival(page);
  await expect(page.getByRole('complementary', { name: 'Carnival' })).toBeVisible();
  const scare = page.getByRole('button', { name: 'Scare a monster', exact: true });
  await scare.focus();
  await page.keyboard.press('Enter');

  const ticket = page.getByRole('dialog', { name: 'Carnival ticket' });
  await expect(ticket).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(ticket.getByRole('link')).toBeFocused();
  await expect(ticket.getByRole('link')).toHaveAttribute('href', APP_PAGE);

  await page.keyboard.press('Escape');
  await expect(ticket).toHaveCount(0);
  await expect(scare).toBeFocused();
  expect(errors).toEqual([]);
});

test('the gargoyle roams the page, darts away when clicked and respects reduced motion', async ({ page }) => {
  const errors = await openCarnival(page);
  const flyer = page.locator('.carnival-flyer');
  await expect(flyer).toBeHidden();
  await page.clock.runFor(GARGOYLE_ARRIVAL_MS);
  await expect(flyer).toBeVisible();

  const first = await flyer.boundingBox();
  await page.clock.runFor(FRAME_MS);
  expect(await flyer.boundingBox()).not.toEqual(first);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The gargoyle lets presses through to the page beneath, yet still darts off.
  const target = await flyer.boundingBox();
  const centre = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const beneath = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    return element.className;
  }, centre);
  expect(beneath).not.toBe('carnival-flyer');
  await page.clock.runFor(GARGOYLE_DART_MS);
  await expect(flyer).toBeHidden();
  await page.clock.runFor(GARGOYLE_RETURN_MS);
  await expect(flyer).toBeVisible();

  // Escape shoos it too.
  await page.keyboard.press('Escape');
  await page.clock.runFor(GARGOYLE_DART_MS);
  await expect(flyer).toBeHidden();
  await page.clock.runFor(GARGOYLE_RETURN_MS);
  await expect(flyer).toBeVisible();

  // Turning on reduced motion grounds it and stills the band.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(flyer).toBeHidden();
  await expect(page.locator('.carnival-pause')).toBeHidden();
  const still = await bandFrame(page);
  await page.clock.runFor(FRAME_MS);
  expect(await bandFrame(page)).toBe(still);
  expect(errors).toEqual([]);
});

test('pausing freezes the carnival, sends the gargoyle away and survives a reload', async ({ page }) => {
  await openCarnival(page);
  await page.clock.runFor(GARGOYLE_ARRIVAL_MS);
  const flyer = page.locator('.carnival-flyer');
  await expect(flyer).toBeVisible();

  // Keyboard activation, as the gargoyle may be flying over the button.
  await page.getByRole('button', { name: 'Pause carnival', exact: true }).focus();
  await page.keyboard.press('Enter');
  const resume = page.getByRole('button', { name: 'Resume carnival', exact: true });
  await expect(resume).toBeVisible();
  await expect(flyer).toBeHidden();

  const frame = await bandFrame(page);
  await page.clock.runFor(GARGOYLE_ARRIVAL_MS);
  expect(await bandFrame(page)).toBe(frame);
  await expect(flyer).toBeHidden();

  await page.reload();
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.getByRole('button', { name: 'Pause carnival', exact: true })).toBeVisible();
  await page.clock.runFor(GARGOYLE_ARRIVAL_MS);
  await expect(page.locator('.carnival-flyer')).toBeVisible();
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the carnival stands still and scared monsters return when the ticket closes', async ({ page }, testInfo) => {
    const errors = await openCarnival(page);
    await expect(page.locator('.carnival-pause')).toBeHidden();
    await expect(page.locator('.carnival-flyer')).toBeHidden();
    const still = await bandFrame(page);
    await page.clock.runFor(FRAME_MS);
    expect(await bandFrame(page)).toBe(still);

    const monster = await findMonster(page);
    await poke(page, monster, testInfo);
    const ticket = page.getByRole('dialog', { name: 'Carnival ticket' });
    await expect(ticket).toBeVisible();
    expect(await greenAround(page, monster)).toBeLessThan(monster.count / 2);

    const close = ticket.getByRole('button', { name: 'Close' });
    const closeBox = await close.boundingBox();
    expect(Math.min(closeBox.width, closeBox.height)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    await close.click();
    await expect(ticket).toHaveCount(0);
    expect(await greenAround(page, monster)).toBe(monster.count);

    // Scaring another monster replaces the ticket: the first returns, the second stays away.
    const [first, second] = await findMonsters(page);
    await poke(page, first, testInfo);
    await expect(ticket).toBeVisible();
    await poke(page, second, testInfo);
    await expect(ticket).toHaveCount(1);
    expect(await greenAround(page, first)).toBe(first.count);
    expect(await greenAround(page, second)).toBeLessThan(second.count / 2);
    await page.keyboard.press('Escape');
    expect(await greenAround(page, second)).toBe(second.count);

    // The ticket is a working link.
    await poke(page, monster, testInfo);
    const link = ticket.getByRole('link');
    const name = await link.textContent();
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
