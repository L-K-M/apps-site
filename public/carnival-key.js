// The carnival's hidden puzzle, shared by carnival.js in the browser and the
// carnival-key command in Node. Each monster has a number; scaring five of
// them in an order makes a key from their numbers, in that order:
//
//   scared:  ghost → cat → vampire → mummy → zombie
//   numbers:   7   →  3  →    8    →   4   →   13
//   key:     FNV-1a over 7, 3, 8, 4, 13            → "69af470a"
//
// The key of any order is no secret: anyone can run this. Which order is
// right is, and lives only on the prize server, as its GIVEAWAY_KEY.
globalThis.carnivalKey = (() => {
  const STEPS = 5; // scares in a key
  // Names read after "the"; the carnival's font shows them in capitals.
  const MONSTERS = Object.freeze([
    { id: 'ghost', name: 'ghost', number: 7 },
    { id: 'zombie', name: 'zombie', number: 13 },
    { id: 'mummy', name: 'mummy', number: 4 },
    { id: 'skeleton', name: 'skeleton', number: 11 },
    { id: 'frankenstein', name: 'Frankenstein\'s monster', number: 9 },
    { id: 'jack', name: 'pumpkin head', number: 2 },
    { id: 'slime', name: 'slime', number: 16 },
    { id: 'cat', name: 'black cat', number: 3 },
    { id: 'vampire', name: 'vampire', number: 8 },
  ]);
  const NUMBERS = new Map(MONSTERS.map(({ id, number }) => [id, number]));
  const FNV = { offset: 0x811c9dc5, prime: 0x01000193 }; // 32-bit FNV-1a
  const KEY_DIGITS = 8;

  // Order matters: ghost then cat makes another key than cat then ghost.
  function keyFor(ids) {
    let hash = FNV.offset;
    for (const id of ids) {
      if (!NUMBERS.has(id)) throw new Error(`Unknown monster: ${id}`);
      hash = Math.imul(hash ^ NUMBERS.get(id), FNV.prime) >>> 0;
    }
    return hash.toString(16).padStart(KEY_DIGITS, '0');
  }

  return Object.freeze({ STEPS, MONSTERS, keyFor });
})();
