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

// The hidden high striker: the ticket booth stands 64 band pixels left of the
// band's centre; its awning sits above every monster's head.
const BOOTH = { fromCentre: -64, row: 64 };
const GIVEAWAY = 'https://play.example.org/api/giveaway';
const INVITE = { url: 'https://play.example.org/invite/abc123def456', code: 'abc123def456', name: 'Lucky Ghost' };
const SWEEP_STEP_MS = 20;
const MAX_SWEEP_STEPS = 200;
const HOLD_MS = 1000; // beyond the bar's pause after a swing
const RINGS = 3;
const NEARLY_FULL = 95; // per cent of the bar
const LOW = 40;

function answerGiveaway(page, status, body) {
  const requests = [];
  return page.route(GIVEAWAY, (route) => {
    requests.push(route.request().postDataJSON());
    if (status === null) return route.abort();
    return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  }).then(() => requests);
}

async function boothPoint(page) {
  return page.evaluate(({ fromCentre, row }) => {
    const scene = document.querySelector('.carnival-scene');
    const box = scene.getBoundingClientRect();
    const scale = box.width / scene.width;
    return { clientX: box.left + (Math.floor(scene.width / 2) + fromCentre + 0.5) * scale, clientY: box.top + (row + 0.5) * scale };
  }, BOOTH);
}

// Step the paused clock until the bar is where the swing should land, then swing.
async function swing(page, aim) {
  const fill = page.locator('.carnival-meter-fill');
  for (let step = 0; step < MAX_SWEEP_STEPS; step += 1) {
    const width = await fill.evaluate((element) => parseFloat(element.style.width) || 0);
    if (aim === 'hit' ? width >= NEARLY_FULL : width > 0 && width <= LOW) break;
    await page.clock.runFor(SWEEP_STEP_MS);
  }
  await page.getByRole('button', { name: 'Swing', exact: true }).click();
  await page.clock.runFor(HOLD_MS);
}

test.describe('the hidden high striker', () => {
  test('the ticket booth hides a game whose winners claim an invite', async ({ page }, testInfo) => {
    const errors = await openCarnival(page);
    const requests = await answerGiveaway(page, 200, INVITE);
    await poke(page, await boothPoint(page), testInfo);

    const game = page.getByRole('dialog', { name: 'High striker' });
    await expect(game).toBeVisible();
    await expect(game).toContainText('Ring the bell 3 times in a row to win an invite to Manors & Menaces.');
    await expect(game.getByRole('button', { name: 'Swing', exact: true })).toBeFocused();

    const status = game.getByRole('status');
    await swing(page, 'miss');
    await expect(status).toContainText('Back to the start.');
    for (let ring = 1; ring < RINGS; ring += 1) {
      await swing(page, 'hit');
      await expect(status).toHaveText(`Ding! ${ring} of ${RINGS}.`);
    }
    await swing(page, 'hit');
    await expect(status).toHaveText('Ding ding ding! You win an invite to Manors & Menaces.');

    const name = game.getByRole('textbox', { name: 'Your name in Manors & Menaces' });
    await expect(name).toBeFocused();
    await name.fill(INVITE.name);
    await game.getByRole('button', { name: 'Claim invite' }).click();
    const invite = game.getByRole('link', { name: INVITE.url });
    await expect(invite).toHaveAttribute('href', INVITE.url);
    await expect(invite).toBeFocused();
    expect(requests).toEqual([{ name: INVITE.name }]);

    await game.screenshot({ path: `test-results/striker-${testInfo.project.name}.png` });
    await page.keyboard.press('Escape');
    await expect(game).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('every third ticket leads keyboard users to the game; the booth reports closures and limits', async ({ page }) => {
    const errors = await openCarnival(page);
    const scare = page.getByRole('button', { name: 'Scare a monster', exact: true });
    const ticket = page.getByRole('dialog', { name: 'Carnival ticket' });
    for (let count = 1; count < 3; count += 1) {
      await scare.focus();
      await page.keyboard.press('Enter');
      await expect(ticket.getByRole('button', { name: 'Try the high striker' })).toHaveCount(0);
    }
    await scare.focus();
    await page.keyboard.press('Enter');
    await ticket.getByRole('button', { name: 'Try the high striker' }).focus();
    await page.keyboard.press('Enter');

    const game = page.getByRole('dialog', { name: 'High striker' });
    await expect(game.getByRole('button', { name: 'Swing', exact: true })).toBeFocused();
    for (let ring = 0; ring < RINGS; ring += 1) await swing(page, 'hit');

    // An unreachable booth may be tried again; a limit ends the game.
    await page.route(GIVEAWAY, (route) => route.abort());
    const claim = game.getByRole('button', { name: 'Claim invite' });
    await claim.click();
    await expect(game.getByRole('status')).toHaveText('The prize booth is closed right now. Try again later.');
    await expect(claim).toBeEnabled();

    await page.unroute(GIVEAWAY);
    await answerGiveaway(page, 429, { error: 'one a day', code: 'GIVEAWAY_LIMIT' });
    await claim.click();
    await expect(game.getByRole('status')).toHaveText('One invite per visitor a day. Come back tomorrow.');
    await expect(claim).toHaveCount(0);
    await expect(game).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(scare).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('closing the game mid-claim brings the invite back when it arrives', async ({ page }, testInfo) => {
    await openCarnival(page);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(GIVEAWAY, async (route) => {
      await held;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(INVITE) });
    });
    await poke(page, await boothPoint(page), testInfo);
    for (let ring = 0; ring < RINGS; ring += 1) await swing(page, 'hit');
    await page.getByRole('button', { name: 'Claim invite' }).click();

    // The server mints the invite even if the winner walks away; it must not be lost.
    const game = page.getByRole('dialog', { name: 'High striker' });
    await page.keyboard.press('Escape');
    await expect(game).toHaveCount(0);
    release();
    await expect(game.getByRole('link', { name: INVITE.url })).toBeFocused();
  });

  test('an empty prize booth says every invite has been won', async ({ page }, testInfo) => {
    await openCarnival(page);
    await answerGiveaway(page, 410, { error: 'gone', code: 'GIVEAWAY_EMPTY' });
    await poke(page, await boothPoint(page), testInfo);
    for (let ring = 0; ring < RINGS; ring += 1) await swing(page, 'hit');
    await page.getByRole('button', { name: 'Claim invite' }).click();
    const game = page.getByRole('dialog', { name: 'High striker' });
    await expect(game.getByRole('status')).toHaveText('Every invite has been won. Try again another day.');
    await expect(game.getByRole('button', { name: 'Claim invite' })).toHaveCount(0);
    await expect(game).toBeFocused();
  });

  test('a link that is not a web address is never shown', async ({ page }, testInfo) => {
    await openCarnival(page);
    await answerGiveaway(page, 200, { ...INVITE, url: 'javascript:alert(1)' });
    await poke(page, await boothPoint(page), testInfo);
    for (let ring = 0; ring < RINGS; ring += 1) await swing(page, 'hit');
    await page.getByRole('button', { name: 'Claim invite' }).click();
    await expect(page.getByRole('dialog', { name: 'High striker' }).getByRole('status')).toHaveText('The prize booth is closed right now. Try again later.');
    await expect(page.locator('.carnival-game a')).toHaveCount(0);
  });
});
