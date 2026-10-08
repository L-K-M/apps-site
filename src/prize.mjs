// The carnival prize's key, for operators. The prize server holds only the
// key of the right order of scares (its GIVEAWAY_KEY); the order itself must
// never ship with this public site, so it is named on the command line here
// and never stored.
import '../public/carnival-key.js';

const { STEPS, MONSTERS, keyFor } = globalThis.carnivalKey;
const IDS = MONSTERS.map(({ id }) => id);

export const PRIZE_MONSTER_IDS = Object.freeze(IDS);

// The key for scaring `order` (monster ids), e.g. ['ghost', 'cat', ...].
export function prizeKey(order) {
  if (order.length !== STEPS) throw new Error(`Name ${STEPS} monsters, in the order they must be scared, not ${order.length}`);

  const unknown = order.filter((id) => !IDS.includes(id));
  if (unknown.length) throw new Error(`Unknown monsters: ${unknown.join(', ')}. Choose from: ${IDS.join(', ')}`);

  // A scared monster hides for a while, so a repeat would be hard to play.
  if (new Set(order).size !== STEPS) throw new Error('Name each monster once');

  return keyFor(order);
}
