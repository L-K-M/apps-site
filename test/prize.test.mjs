import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { PRIZE_MONSTER_IDS, prizeKey } from '../src/prize.mjs';

const run = promisify(execFile);
const CLI = new URL('../bin/apps-site.mjs', import.meta.url).pathname;
const STEPS = 5;
const EXAMPLE = ['ghost', 'cat', 'vampire', 'mummy', 'zombie'];

test('every order of five monsters makes its own key', () => {
  assert.equal(prizeKey(EXAMPLE), '69af470a');

  const keys = new Set();
  let orders = 0;
  const walk = (prefix) => {
    if (prefix.length === STEPS) {
      orders += 1;
      keys.add(prizeKey(prefix));
      return;
    }
    for (const id of PRIZE_MONSTER_IDS) if (!prefix.includes(id)) walk([...prefix, id]);
  };
  walk([]);
  assert.equal(keys.size, orders);
});

test('names five known monsters, each once', () => {
  assert.throws(() => prizeKey(EXAMPLE.slice(1)), /Name 5 monsters/);
  assert.throws(() => prizeKey([...EXAMPLE.slice(1), 'werewolf']), /Unknown monsters: werewolf/);
  assert.throws(() => prizeKey([...EXAMPLE.slice(1), 'cat']), /each monster once/);
});

test('the carnival-key command prints the key for the prize server', async () => {
  const { stdout } = await run(process.execPath, [CLI, 'carnival-key', ...EXAMPLE]);
  assert.equal(stdout, 'GIVEAWAY_KEY=69af470a\n');
  await assert.rejects(run(process.execPath, [CLI, 'carnival-key', 'ghost']), /Name 5 monsters/);
});
