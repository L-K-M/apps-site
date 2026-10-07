// Haunted carnival easter egg: a pixel-art band at the foot of the directory
// whose monsters flee when clicked, and a gargoyle that roams the viewport.
//
//   ┌─────────────────────────────── viewport ───────────────────────────────┐
//   │  gargoyle: own fixed canvas, cruises anywhere, roosts upside down at   │
//   │  the top edge, darts away when clicked                                 │
//   │                             ...app grid...                             │
//   ├───────────────────── .carnival band: one canvas ───────────────────────┤
//   │ carousel  tent  booth  HAUNTED HOUSE  lamp  wheel  graves  striker     │
//   │ monsters wander and wrap; a click scares one off and shows a ticket    │
//   │ to a random app; it returns later through the haunted house door      │
//   └────────────────────────────────────────────────────────────────────────┘
//
// Layers, lowest first:
//   Surface   pixel buffer with clipped drawing primitives and sprites
//   Scenery   rides and buildings: a cached still layer plus lively details
//   Crowd     monster state machines and hit testing
//   Gargoyle  the free-flying monster and its overlay canvas
//   Carnival  DOM wiring: sizing, frame loop, input, ticket, pause, motion
(() => {
  const band = document.querySelector('[data-carnival]');
  if (!band) return;

  const PIXEL = 2; // CSS px per band pixel
  const ROWS = 100; // band pixels; the band is 200 CSS px tall
  const HORIZON = 86; // rides and buildings stand on this row
  const LANES = [92, 95, 98]; // monster feet rows, back to front
  const STILL_TIME = 4.2; // show time drawn when motion is reduced
  const MAX_STEP = 0.05; // seconds; skips long gaps such as background tabs
  const RESIZE_DELAY_MS = 160;
  const PAUSE_KEY = 'apps-site:carnival-paused';
  const Motion = Object.freeze({ FULL: 'full', REDUCED: 'reduced' });

  // ── Surface ───────────────────────────────────────────────────────────────

  // Sprite letters name custom properties declared in style.css.
  const PALETTE_PROPERTIES = {
    w: '--paper', k: '--ink', m: '--muted', l: '--rule', r: '--accent',
    R: '--pixel-red', a: '--pixel-amber', g: '--pixel-green',
  };
  const TRANSPARENT = '.';
  const Flip = Object.freeze({ NONE: 0, HORIZONTAL: 1, VERTICAL: 2 });
  const Fill = Object.freeze({ SOLID: 'solid', DITHER: 'dither' });

  // Pack #rrggbb into one ImageData word in the platform's byte order.
  function packColour(hex) {
    const bytes = Uint8ClampedArray.of(...[1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)), 255);
    return new Uint32Array(bytes.buffer)[0];
  }

  function readPalette(element) {
    const style = getComputedStyle(element);
    // A canvas normalises any CSS colour to #rrggbb.
    const probe = document.createElement('canvas').getContext('2d');
    const palette = {};
    for (const [letter, property] of Object.entries(PALETTE_PROPERTIES)) {
      probe.fillStyle = style.getPropertyValue(property).trim();
      palette[letter] = packColour(probe.fillStyle);
    }
    return palette;
  }

  // Sprites are drawn as text, one letter per pixel; see PALETTE_PROPERTIES.
  function sprite(rows) {
    return { rows, width: Math.max(...rows.map((row) => row.length)), height: rows.length };
  }

  function createSurface(context, width, height, palette) {
    const image = context.createImageData(width, height);
    const pixels = new Uint32Array(image.data.buffer);

    function put(x, y, letter) {
      x = Math.floor(x);
      y = Math.floor(y);
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      pixels[y * width + x] = palette[letter];
    }

    function rect(x, y, w, h, letter) {
      for (let row = 0; row < h; row += 1) {
        for (let column = 0; column < w; column += 1) put(x + column, y + row, letter);
      }
    }

    // Bresenham, so diagonals stay one pixel wide.
    function line(x0, y0, x1, y1, letter) {
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let error = dx + dy;
      for (;;) {
        put(x0, y0, letter);
        if (x0 === x1 && y0 === y1) return;
        const doubled = 2 * error;
        if (doubled >= dy) { error += dy; x0 += sx; }
        if (doubled <= dx) { error += dx; y0 += sy; }
      }
    }

    function disc(cx, cy, radius, letter) {
      for (let y = -radius; y <= radius; y += 1) {
        const half = Math.floor(Math.sqrt(radius * radius - y * y));
        rect(cx - half, cy + y, half * 2 + 1, 1, letter);
      }
    }

    // Draw a sprite by its top-left corner. Dithering skips alternate pixels,
    // so a ghost can fade without alpha blending.
    function blit(art, left, top, { flip = Flip.NONE, fill = Fill.SOLID, phase = 0 } = {}) {
      left = Math.round(left);
      top = Math.round(top);
      for (let row = 0; row < art.height; row += 1) {
        const source = flip & Flip.VERTICAL ? art.rows[art.height - 1 - row] : art.rows[row];
        for (let column = 0; column < art.width; column += 1) {
          const letter = source[flip & Flip.HORIZONTAL ? art.width - 1 - column : column];
          if (!letter || letter === TRANSPARENT) continue;
          if (fill === Fill.DITHER && (row + column + phase) % 2) continue;
          put(left + column, top + row, letter);
        }
      }
    }

    // Draw a sprite standing on (x, feet), centred horizontally.
    function stand(art, x, feet, options) {
      blit(art, x - Math.floor(art.width / 2), feet - art.height, options);
    }

    return {
      width,
      height,
      put,
      rect,
      line,
      disc,
      blit,
      stand,
      clear: (letter) => pixels.fill(palette[letter]),
      erase: () => pixels.fill(0),
      snapshot: () => pixels.slice(),
      restore: (copy) => pixels.set(copy),
      present: () => context.putImageData(image, 0, 0),
    };
  }

  // ── Sprites ───────────────────────────────────────────────────────────────
  // Monsters face right; Flip.HORIZONTAL turns them around.

  const ART = {
    ghost: [sprite([
      '..kkkkk..',
      '.kwwwwwk.',
      'kwwwwwwwk',
      'kwwwkwkwk',
      'kwwwkwkwk',
      'kwwwwwwwk',
      'kwwwwwkwk',
      'kwwwwwwwk',
      'kwwwwwwwk',
      'kwwwwwwwk',
      'kwkwkwkwk',
      '.k.k.k.k.',
    ]), sprite([
      '..kkkkk..',
      '.kwwwwwk.',
      'kwwwwwwwk',
      'kwwwkwkwk',
      'kwwwkwkwk',
      'kwwwwwwwk',
      'kwwwwwkwk',
      'kwwwwwwwk',
      'kwwwwwwwk',
      'kwwwwwwwk',
      'kkwkwkwkk',
      'k.k.k.k.k',
    ])],
    zombie: [sprite([
      '..kkkk....',
      '.kggggk...',
      '.kgggkgk..',
      '.kggggk...',
      '.kggkkk...',
      '..kggk....',
      '.kkkkkkkkk',
      '.kmmmmgggk',
      '.kmmmkkkkk',
      '.kmkmmk...',
      '.kkkkkk...',
      '..k..k....',
      '.kk..kk...',
    ]), sprite([
      '..kkkk....',
      '.kggggk...',
      '.kgggkgk..',
      '.kggggk...',
      '.kggkkk...',
      '..kggk....',
      '.kkkkkkkkk',
      '.kmmmmgggk',
      '.kmmmkkkkk',
      '.kmkmmk...',
      '.kkkkkk...',
      '...kk.....',
      '...kkk....',
    ])],
    mummy: [sprite([
      '..kkkk...',
      '.kllllk..',
      '.kwwkak..',
      '.kllllk..',
      '..kwwk...',
      '.kkkkkkkk',
      '.kllllwwk',
      '.kwwwkkkk',
      '.kllllk..',
      '.kwwwwk..',
      '.kllllk..',
      '..k..k...',
      '.kk..kk..',
    ]), sprite([
      '..kkkk...',
      '.kllllk..',
      '.kwwkak..',
      '.kllllk..',
      '..kwwk...',
      '.kkkkkkkk',
      '.kllllwwk',
      '.kwwwkkkk',
      '.kllllk..',
      '.kwwwwk..',
      '.kllllk..',
      '...kk....',
      '...kkk...',
    ])],
    skeleton: [sprite([
      '..kkkk..',
      '.kwwwwk.',
      '.kwkwkk.',
      '.kwwwwk.',
      '..kwkwk.',
      '...kk...',
      '.kwwwwk.',
      'kkwkkwkk',
      'w.kwwk.w',
      '..kwwk..',
      '...kk...',
      '..k..k..',
      '.kw..wk.',
    ]), sprite([
      '..kkkk..',
      '.kwwwwk.',
      '.kwkwkk.',
      '.kwwwwk.',
      '..kwkwk.',
      '...kk...',
      '.kwwwwk.',
      'kkwkkwkk',
      'w.kwwk.w',
      '..kwwk..',
      '...kk...',
      '...kk...',
      '...wkk..',
    ])],
    bones: [sprite([
      '..kkkk...',
      '.kwwwwk..',
      '.kwkwkk..',
      'w.kwwkw.w',
      'kwkwkwkwk',
    ])],
    frankenstein: [sprite([
      '.kkkkkk...',
      '.kkkkkk...',
      '.kggggk...',
      '.kggkgk...',
      '.kggggk...',
      '.kgkkgk...',
      'mkggggkm..',
      '.kkkkkkkkk',
      'kkmkkmkgggk',
      'kkkkkkkkkk',
      '.kkkkkk...',
      '.kmmmmk...',
      '.kk..kk...',
      '.kk..kk...',
      'kkk..kkk..',
    ]), sprite([
      '.kkkkkk...',
      '.kkkkkk...',
      '.kggggk...',
      '.kggkgk...',
      '.kggggk...',
      '.kgkkgk...',
      'mkggggkm..',
      '.kkkkkkkkk',
      'kkmkkmkgggk',
      'kkkkkkkkkk',
      '.kkkkkk...',
      '.kmmmmk...',
      '..kkkk....',
      '..kkkk....',
      '..kkkkk...',
    ])],
    jack: [sprite([
      '....g....',
      '..kkgkk..',
      '.kaaaaak.',
      'kaaakakak',
      'kaaaaaaak',
      'kaakkkkak',
      '.kaaaaak.',
      '..kkkkk..',
      '..kmmmk..',
      '.kkmmmkk.',
      '..kmmmk..',
      '..k...k..',
      '.kk...kk.',
    ]), sprite([
      '....g....',
      '..kkgkk..',
      '.kaaaaak.',
      'kaaakakak',
      'kaaaaaaak',
      'kaakkkkak',
      '.kaaaaak.',
      '..kkkkk..',
      '..kmmmk..',
      '.kkmmmkk.',
      '..kmmmk..',
      '...kk....',
      '...kkk...',
    ])],
    slime: [sprite([
      '..kkkkk..',
      '.kgggggk.',
      'kggwkgwkk',
      'kggggggggk',
      '.kkkkkkkk.',
    ]), sprite([
      '...kkk...',
      '..kgggk..',
      '.kggggk..',
      '.kgwkwkk.',
      '.kgggggk.',
      'kgggggggk',
      '.kkkkkkk.',
    ])],
    vampire: [sprite([
      '..kkkk...',
      '.kkkkkk..',
      '.kwwwkk..',
      '.kwkwwk..',
      '.kwwwwk..',
      'rrkwkwkrr',
      'kkrkkkrkk',
      'kkrkRkrkk',
      'kkrkkkrkk',
      'kkrkkkrkk',
      'kkkkkkkkk',
      '..k..k...',
      '.kk..kk..',
    ]), sprite([
      '..kkkk...',
      '.kkkkkk..',
      '.kwwwkk..',
      '.kwkwwk..',
      '.kwwwwk..',
      'rrkwkwkrr',
      'kkrkkkrkk',
      'kkrkRkrkk',
      'kkrkkkrkk',
      'kkrkkkrkk',
      'kkkkkkkkk',
      '...kk....',
      '...kkk...',
    ])],
    bat: [sprite([
      'k.....k',
      'kk.k.kk',
      '.kkkkk.',
      '...k...',
    ]), sprite([
      '...k...',
      '.kkkkk.',
      'kk.k.kk',
      'k.....k',
    ])],
    gargoyle: [sprite([
      'kk............kk',
      'kmk..k....k..kmk',
      'kmmk.kkkkkk.kmmk',
      '.kmmkkmmmmkkmmk.',
      '.kmmkmRmmRmkmmk.',
      '..kmkmmmmmmkmk..',
      '..kkkkmkkmkkkk..',
      '.....kmmmmk.....',
      '.....kmmmmk.....',
      '......kmmk......',
      '.....kk..kk.....',
      '................',
    ]), sprite([
      '................',
      '.....k....k.....',
      '.....kkkkkk.....',
      'kkk.kkmmmmkk.kkk',
      'kmmkkmRmmRmkkmmk',
      'kmmmkmmmmmmkmmmk',
      '.kmmkkmkkmkkmmk.',
      '..kkkkmmmmkkkk..',
      '.....kmmmmk.....',
      '......kmmk......',
      '.....kk..kk.....',
      '................',
    ]), sprite([
      '................',
      '.....k....k.....',
      '.....kkkkkk.....',
      '....kkmmmmkk....',
      '....kmRmmRmk....',
      '..kkkmmmmmmkkk..',
      '.kmmkkmkkmkkmmk.',
      'kmmmkkmmmmkkmmmk',
      'kmmk.kmmmmk.kmmk',
      'kmk...kmmk...kmk',
      'kk...kk..kk...kk',
      '................',
    ])],
    roost: [sprite([
      '......k..k......',
      '.....kkkkkk.....',
      '....kkmmmmkk....',
      '....kmRmmRmk....',
      '....kmmmmmmk....',
      '....kkmkkmkk....',
      '....kmkmmkmk....',
      '....kmkmmkmk....',
      '....kmkmmkmk....',
      '.....kkmmkk.....',
      '......kmmk......',
      '.....kk..kk.....',
    ])],
    cat: [sprite([
      'k.......k..k',
      'k.......kkkk',
      '.k......kakk',
      '..kkkkkkkkkk',
      '..kkkkkkkkk.',
      '..kkkkkkkk..',
      '..kk....kk..',
      '.k..k..k..k.',
    ]), sprite([
      'k.......k..k',
      'k.......kkkk',
      '.k......kakk',
      '..kkkkkkkkkk',
      '..kkkkkkkkk.',
      '..kkkkkkkk..',
      '...kk..kk...',
      '...kk..kk...',
    ])],
    alarm: sprite(['r', 'r', 'r', '.', 'r']),
    grave: sprite([
      '..kkk..',
      '.klllk.',
      'klllllk',
      'klkkklk',
      'klllllk',
      'klkkklk',
      'klllllk',
      'klllllk',
      'kkkkkkk',
    ]),
    cross: sprite([
      '..k..',
      '..k..',
      'kkkkk',
      '..k..',
      '..k..',
      '..k..',
      '.kkk.',
    ]),
    pumpkin: sprite([
      '...g...',
      '.kkgkk.',
      'kaaaaak',
      'kakakak',
      'kaaaaak',
      '.kkkkk.',
    ]),
    hand: sprite([
      'g.g.g',
      'ggggg',
      '.ggg.',
      '.ggg.',
    ]),
    horse: sprite([
      '.kk.....',
      'kmmk..k.',
      '.kmmmmk.',
      '.kmmmmk.',
      '.k.k.k..',
    ]),
  };

  // ── Scenery ───────────────────────────────────────────────────────────────
  // Offsets from the band's centre, so phones see the haunted house and wide
  // screens see more of the fair.

  const SITE = {
    carousel: -232, tent: -128, booth: -64, house: 0, lamp: 46, wheel: 104,
    graves: 166, striker: 222, smallTent: 286,
  };
  const OUTSKIRT_START = 330; // trees and pumpkins repeat beyond the rides
  const OUTSKIRT_SPACING = 42;
  const HOUSE = { left: -24, door: 2 }; // offsets from SITE.house
  const doorLeft = (x) => x + HOUSE.door - 3;
  const Door = Object.freeze({ SHUT: 'shut', OPEN: 'open' });

  // Smooth pseudo-random signal in [0, 1) for flickers, stable per seed.
  function flicker(time, seed) {
    const value = Math.sin(time * 1.7 + seed * 12.9) + Math.sin(time * 4.3 + seed * 7.1) * 0.5;
    return (value + 1.5) / 3;
  }

  function tree(surface, x, lean) {
    surface.line(x, HORIZON, x + lean, HORIZON - 14, 'k');
    surface.line(x + 1, HORIZON, x + lean + 1, HORIZON - 9, 'k');
    surface.line(x + lean, HORIZON - 10, x + lean - 7, HORIZON - 19, 'k');
    surface.line(x + lean - 4, HORIZON - 14, x + lean - 7, HORIZON - 14, 'k');
    surface.line(x + lean, HORIZON - 14, x + lean + 6, HORIZON - 22, 'k');
    surface.line(x + lean + 3, HORIZON - 18, x + lean + 8, HORIZON - 17, 'k');
    surface.line(x + lean, HORIZON - 13, x + lean + 1, HORIZON - 24, 'k');
  }

  function stripedTent(surface, x, base, width, wall, roof) {
    const half = Math.floor(width / 2);
    const top = base - wall - roof;

    // Roof stripes fan out from the apex.
    for (let row = 1; row <= roof; row += 1) {
      const span = Math.round(half * row / roof);
      for (let dx = -span; dx <= span; dx += 1) {
        const stripe = Math.floor((dx / Math.max(row, 1)) * roof / 4 + 64) % 2;
        surface.put(x + dx, top + row, stripe ? 'r' : 'w');
      }
      surface.put(x - span - 1, top + row, 'k');
      surface.put(x + span + 1, top + row, 'k');
    }

    for (let row = 0; row < wall; row += 1) {
      for (let dx = -half + 2; dx <= half - 2; dx += 1) surface.put(x + dx, base - wall + row, Math.floor((dx + 64) / 3) % 2 ? 'r' : 'w');
      surface.put(x - half + 1, base - wall + row, 'k');
      surface.put(x + half - 1, base - wall + row, 'k');
    }
    surface.line(x - half - 1, base - wall, x + half + 1, base - wall, 'k');

    // Dark entrance flap.
    for (let row = 0; row < wall - 2; row += 1) {
      const span = Math.floor(row / 2);
      surface.rect(x - span, base - wall + 2 + row, span * 2 + 1, 1, 'k');
    }
    surface.line(x, top - 6, x, top, 'k');
  }

  function pennant(surface, x, y, time) {
    const wave = Math.floor(time * 4) % 2;
    surface.rect(x + 1, y, 4, 1, 'r');
    surface.rect(x + 1, y + 1, 3 - wave, 1, 'r');
    surface.put(x + 1, y + 2, 'r');
  }

  function house(surface, x) {
    const left = x + HOUSE.left;
    const base = HORIZON;

    // Tower on the left with a crooked spire.
    surface.rect(left, base - 46, 12, 46, 'k');
    surface.rect(left + 1, base - 45, 10, 45, 'm');
    for (let row = 0; row < 18; row += 1) {
      const span = Math.floor(row / 3);
      surface.rect(left + 6 - span - (row < 6 ? 1 : 0), base - 64 + row, span * 2 + 1, 1, 'k');
    }
    surface.line(left - 1, base - 46, left + 12, base - 46, 'k');

    // Main block and steep gable.
    surface.rect(left + 11, base - 32, 37, 32, 'k');
    surface.rect(left + 12, base - 31, 35, 31, 'm');
    for (let row = 0; row < 20; row += 1) {
      const span = Math.floor(row * 0.95);
      surface.rect(left + 29 - span, base - 52 + row, span * 2 + 1, 1, 'k');
      if (row % 4 === 3) surface.rect(left + 30 - span, base - 52 + row, span * 2 - 1, 1, 'm');
    }
    surface.line(left + 9, base - 32, left + 49, base - 32, 'k');

    // Chimney, leaning.
    surface.rect(left + 36, base - 49, 4, 9, 'k');
    surface.put(left + 40, base - 50, 'k');

    // Clapboard lines.
    for (let y = base - 28; y < base; y += 4) surface.rect(left + 12, y, 35, 1, 'k');

    // Porch step.
    surface.rect(doorLeft(x) - 3, base, 12, 1, 'k');
  }

  // Windows, eyes, door and the attic ghost change with time.
  function houseLights(surface, x, time, door) {
    const left = x + HOUSE.left;
    const base = HORIZON;
    const windows = [
      [left + 3, base - 40, 6, 7], [left + 3, base - 26, 6, 7],
      [left + 16, base - 25, 6, 7], [left + 38, base - 25, 6, 7], [left + 38, base - 13, 6, 7],
    ];

    windows.forEach(([wx, wy, ww, wh], index) => {
      const lit = flicker(time, index) > 0.42;
      surface.rect(wx, wy, ww, wh, 'k');
      if (lit) surface.rect(wx + 1, wy + 1, ww - 2, wh - 2, 'a');
      surface.rect(wx, wy + 3, ww, 1, 'k');
      surface.rect(wx + 2, wy, 1, wh, 'k');

      // Something blinks in the dark windows.
      if (!lit && index === 3 && Math.floor(time * 2) % 5) {
        surface.put(wx + 1, wy + 2, 'w');
        surface.put(wx + 4, wy + 2, 'w');
      }
    });

    // Attic: a ghost peeks out now and then.
    const attic = { x: left + 27, y: base - 44 };
    surface.rect(attic.x, attic.y, 5, 5, 'k');
    if (Math.floor(time / 3) % 3 === 1) {
      surface.rect(attic.x + 1, attic.y + 1, 3, 4, 'w');
      surface.put(attic.x + 1, attic.y + 2, 'k');
      surface.put(attic.x + 3, attic.y + 2, 'k');
    }

    // Door: accent red, dark when a monster is coming out.
    const doorX = doorLeft(x);
    surface.rect(doorX - 1, base - 12, 8, 12, 'k');
    if (door === Door.SHUT) {
      surface.rect(doorX, base - 11, 6, 11, 'r');
      surface.put(doorX + 4, base - 6, 'a');
    } else {
      surface.put(doorX + 1, base - 8, 'a');
      surface.put(doorX + 4, base - 8, 'a');
    }
    surface.rect(doorX + 1, base - 13, 4, 1, 'k');
  }

  function ferrisWheel(surface, x, time) {
    const hub = { x, y: HORIZON - 36 };
    const radius = 28;
    const spokes = 8;
    const turn = time * 0.35;

    surface.line(hub.x, hub.y, hub.x - 16, HORIZON, 'k');
    surface.line(hub.x, hub.y, hub.x + 16, HORIZON, 'k');
    for (let step = 0; step < 180; step += 1) {
      const angle = (step / 180) * Math.PI * 2;
      surface.put(hub.x + Math.cos(angle) * radius, hub.y + Math.sin(angle) * radius, 'k');
    }

    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = turn + (spoke / spokes) * Math.PI * 2;
      const rimX = hub.x + Math.cos(angle) * radius;
      const rimY = hub.y + Math.sin(angle) * radius;
      surface.line(hub.x, hub.y, rimX, rimY, 'm');
      surface.put(rimX, rimY, Math.floor(time * 2 + spoke) % 2 ? 'a' : 'k');

      // Gondolas hang level as the wheel turns.
      const left = Math.round(rimX) - 2;
      const top = Math.round(rimY) + 1;
      surface.rect(left + 2, top, 1, 2, 'k');
      surface.rect(left, top + 2, 5, 3, 'k');
      surface.rect(left + 1, top + 2, 3, 2, 'r');
    }
    surface.rect(hub.x - 1, hub.y - 1, 3, 3, 'k');
  }

  function carousel(surface, x, time) {
    const roofTop = HORIZON - 32;
    stripedTent(surface, x, roofTop + 9, 38, 0, 9);
    surface.rect(x - 19, roofTop + 10, 39, 1, 'r');
    surface.rect(x, roofTop + 10, 1, 22, 'k');
    surface.rect(x - 21, HORIZON - 2, 43, 2, 'k');

    // Horses rise and fall on their poles as the platform turns.
    for (let index = 0; index < 4; index += 1) {
      const angle = time * 0.9 + index * Math.PI / 2;
      const depth = Math.sin(angle);
      if (depth < -0.2) continue;
      const hx = Math.round(x + Math.cos(angle) * 14);
      const bob = Math.round(Math.sin(time * 3 + index) * 2);
      surface.line(hx, roofTop + 11, hx, HORIZON - 3, 'm');
      surface.blit(ART.horse, hx - 4, HORIZON - 15 + bob, { flip: Math.cos(angle + Math.PI / 2) > 0 ? Flip.NONE : Flip.HORIZONTAL });
    }
  }

  function booth(surface, x) {
    surface.rect(x - 8, HORIZON - 20, 17, 20, 'k');
    surface.rect(x - 7, HORIZON - 13, 15, 12, 'w');
    surface.rect(x - 4, HORIZON - 11, 9, 5, 'k');
    for (let column = 0; column < 19; column += 1) surface.rect(x - 9 + column, HORIZON - 23, 1, 4, Math.floor(column / 2) % 2 ? 'r' : 'w');
    surface.line(x - 9, HORIZON - 24, x + 9, HORIZON - 24, 'k');
    surface.line(x - 9, HORIZON - 19, x + 9, HORIZON - 19, 'k');
  }

  // The ticket seller is a skeleton, naturally.
  function boothClerk(surface, x, time) {
    const nod = Math.floor(time * 1.5) % 4 === 0 ? 1 : 0;
    surface.rect(x - 1, HORIZON - 11 + nod, 3, 3, 'w');
    surface.put(x - 1, HORIZON - 10 + nod, 'k');
    surface.put(x + 1, HORIZON - 10 + nod, 'k');
  }

  function lamp(surface, x, time) {
    surface.rect(x, HORIZON - 24, 1, 24, 'k');
    surface.rect(x - 2, HORIZON - 28, 5, 4, 'k');
    surface.rect(x - 1, HORIZON - 27, 3, 2, flicker(time, 9) > 0.2 ? 'a' : 'k');
    surface.rect(x - 2, HORIZON, 5, 1, 'k');
  }

  function graveyard(surface, x) {
    for (let fence = -22; fence <= 22; fence += 3) {
      surface.rect(x + fence, HORIZON - 9, 1, 9, 'k');
      surface.put(x + fence, HORIZON - 10, 'k');
    }
    surface.line(x - 22, HORIZON - 6, x + 22, HORIZON - 6, 'k');
    surface.stand(ART.grave, x - 13, HORIZON + 1);
    surface.stand(ART.cross, x - 2, HORIZON);
    surface.stand(ART.grave, x + 10, HORIZON + 2);
  }

  // Every few seconds a hand claws up between the graves.
  function graveHand(surface, x, time) {
    const cycle = time % 7;
    if (cycle > 2) return;
    const rise = Math.min(4, Math.floor(Math.sin((cycle / 2) * Math.PI) * 6));
    if (rise <= 0) return;
    surface.blit({ ...ART.hand, rows: ART.hand.rows.slice(0, rise), height: rise }, x + 3, HORIZON + 2 - rise);
  }

  function striker(surface, x, time) {
    surface.rect(x - 1, HORIZON - 44, 3, 44, 'k');
    surface.rect(x, HORIZON - 43, 1, 42, 'w');
    for (let mark = HORIZON - 40; mark < HORIZON; mark += 6) surface.put(x, mark, 'r');
    surface.rect(x - 6, HORIZON - 3, 13, 3, 'k');

    // A puck flies up; the bell flashes when it hits.
    const cycle = time % 5;
    const height = cycle < 1 ? Math.sin(cycle * Math.PI) * 42 : 0;
    surface.rect(x - 1, Math.round(HORIZON - 4 - height), 3, 2, 'r');
    surface.disc(x, HORIZON - 47, 2, height > 38 ? 'a' : 'k');
  }

  // A few bats circle the tower.
  function towerBats(surface, x, time) {
    for (let index = 0; index < 3; index += 1) {
      const angle = time * 0.8 + index * 2.1;
      const bx = x + Math.cos(angle) * (16 + index * 5);
      const by = 16 + Math.sin(angle * 1.3) * 5 + index * 3;
      surface.stand(ART.bat[Math.floor(time * 8 + index) % 2], bx, by);
    }
  }

  function moon(surface, x) {
    surface.disc(x, 13, 7, 'l');
    surface.disc(x + 2, 11, 1, 'w');
    surface.put(x - 3, 16, 'w');
  }

  function outskirts(surface, centre) {
    for (let offset = OUTSKIRT_START, index = 0; offset < surface.width; offset += OUTSKIRT_SPACING, index += 1) {
      for (const x of [centre - offset, centre + offset]) {
        if (index % 3 === 1) surface.stand(ART.pumpkin, x, HORIZON + 1);
        else if (index % 3 === 2) surface.stand(ART.grave, x, HORIZON + 1);
        else tree(surface, x, index % 2 ? 2 : -2);
      }
    }
  }

  function paintStill(surface, centre) {
    surface.clear('w');
    surface.rect(0, HORIZON, surface.width, 1, 'l');
    for (let x = (centre % 7) - 7; x < surface.width; x += 7) surface.put(x + ((x * 3) % 5), HORIZON + 6 + ((x * 7) % 9), 'l');
    moon(surface, centre - 48);
    outskirts(surface, centre);
    tree(surface, centre + SITE.graves + 34, 3);
    tree(surface, centre - 186, -2);
    stripedTent(surface, centre + SITE.tent, HORIZON, 52, 14, 22);
    stripedTent(surface, centre + SITE.smallTent, HORIZON, 32, 10, 14);
    booth(surface, centre + SITE.booth);
    graveyard(surface, centre + SITE.graves);
    house(surface, centre + SITE.house);
    surface.stand(ART.pumpkin, centre + SITE.house + 28, HORIZON + 1);
    surface.stand(ART.pumpkin, centre + SITE.booth + 14, HORIZON + 1);
  }

  function paintLively(surface, centre, time, door) {
    carousel(surface, centre + SITE.carousel, time);
    pennant(surface, centre + SITE.tent, HORIZON - 42, time);
    pennant(surface, centre + SITE.smallTent, HORIZON - 30, time + 0.5);
    boothClerk(surface, centre + SITE.booth, time);
    houseLights(surface, centre + SITE.house, time, door);
    towerBats(surface, centre + SITE.house + HOUSE.left + 6, time);
    lamp(surface, centre + SITE.lamp, time);
    ferrisWheel(surface, centre + SITE.wheel, time);
    graveHand(surface, centre + SITE.graves, time);
    striker(surface, centre + SITE.striker, time);
  }

  // ── Crowd ─────────────────────────────────────────────────────────────────

  const Mood = Object.freeze({
    WANDER: 'wander', STARTLED: 'startled', FLEE: 'flee', COLLAPSED: 'collapsed',
    VANISH: 'vanish', BAT: 'bat', HIDDEN: 'hidden', EMERGE: 'emerge',
  });
  const Reaction = Object.freeze({ RUN: 'run', LEAP: 'leap', CRUMBLE: 'crumble', VANISH: 'vanish', TRANSFORM: 'transform', UNRAVEL: 'unravel' });
  const JUMP = { [Reaction.LEAP]: 8 }; // band pixels a startled monster hops; others hop 2
  const Gait = Object.freeze({ WALK: 'walk', FLOAT: 'float', HOP: 'hop' });
  const TIMING = { startled: 0.45, collapsed: 1.4, vanish: 0.8, emerge: 0.7, hiddenMin: 6, hiddenSpread: 7, turnMin: 7, turnSpread: 9 };
  const FLEE_SPEED = 70;
  const BAT_LIFT = 26;
  const EDGE = 14; // band pixels beyond the edge before a monster wraps or is gone

  // A ticket line reads "<fled>, <dropped> <random app>."; without apps, "<fled>.".
  const MONSTERS = [
    { id: 'ghost', art: ART.ghost, speed: 9, gait: Gait.FLOAT, reaction: Reaction.VANISH, offset: -36, fled: 'You startled the ghost and it vanished', dropped: 'leaving a ticket to' },
    { id: 'zombie', art: ART.zombie, speed: 3.5, gait: Gait.WALK, reaction: Reaction.RUN, offset: 64, fled: 'The zombie fled at a surprising pace', dropped: 'dropping a ticket to' },
    { id: 'mummy', art: ART.mummy, speed: 4.5, gait: Gait.WALK, reaction: Reaction.UNRAVEL, offset: -150, fled: 'The mummy ran off unravelling', dropped: 'shedding a ticket to' },
    { id: 'skeleton', art: ART.skeleton, speed: 8, gait: Gait.WALK, reaction: Reaction.CRUMBLE, offset: 130, fled: 'You scared the skeleton to pieces', dropped: 'scattering a ticket to' },
    { id: 'frankenstein', art: ART.frankenstein, speed: 5, gait: Gait.WALK, reaction: Reaction.RUN, offset: -95, fled: 'Frankenstein\'s monster stomped off in a huff', dropped: 'dropping a ticket to' },
    { id: 'jack', art: ART.jack, speed: 7, gait: Gait.WALK, reaction: Reaction.RUN, offset: 190, fled: 'The pumpkin head bolted', dropped: 'leaving a ticket to' },
    { id: 'slime', art: ART.slime, speed: 6, gait: Gait.HOP, reaction: Reaction.RUN, offset: 22, fled: 'The slime wobbled away', dropped: 'leaving a sticky ticket to' },
    { id: 'cat', art: ART.cat, speed: 11, gait: Gait.WALK, reaction: Reaction.LEAP, offset: 98, fled: 'The black cat leapt a foot in the air and fled', dropped: 'knocking over a ticket to' },
    { id: 'vampire', art: ART.vampire, speed: 6.5, gait: Gait.WALK, reaction: Reaction.TRANSFORM, offset: -200, fled: 'The vampire turned into a bat', dropped: 'dropping a ticket to' },
  ];

  const wrap = (value, size) => ((value % size) + size) % size;

  function createCrowd() {
    let width = 0;
    const monsters = MONSTERS.map((kind, index) => ({
      kind,
      x: kind.offset,
      lane: LANES[index % LANES.length],
      facing: index % 2 ? 1 : -1,
      mood: Mood.WANDER,
      timer: 0,
      turnIn: TIMING.turnMin + index,
      lift: 0,
      trail: 0,
    }));

    function placeAround(centre, size) {
      width = size;
      for (const monster of monsters) monster.x = wrap(centre + monster.kind.offset, width);
    }

    function resize(centre, size) {
      if (!width) return placeAround(centre, size);
      width = size;
      for (const monster of monsters) if (monster.mood === Mood.WANDER) monster.x = wrap(monster.x, width);
    }

    function hide(monster) {
      monster.mood = Mood.HIDDEN;
      monster.timer = TIMING.hiddenMin + Math.random() * TIMING.hiddenSpread;
    }

    function update(step, doorX) {
      for (const monster of monsters) {
        const { kind } = monster;
        monster.timer -= step;

        switch (monster.mood) {
          case Mood.WANDER:
            monster.x += monster.facing * kind.speed * step;
            if (monster.x < -EDGE) monster.x += width + EDGE * 2;
            if (monster.x > width + EDGE) monster.x -= width + EDGE * 2;
            monster.turnIn -= step;
            if (monster.turnIn <= 0) {
              monster.facing *= -1;
              monster.turnIn = TIMING.turnMin + Math.random() * TIMING.turnSpread;
            }
            break;
          case Mood.STARTLED:
            if (monster.timer > 0) break;
            if (kind.reaction === Reaction.VANISH) Object.assign(monster, { mood: Mood.VANISH, timer: TIMING.vanish });
            else if (kind.reaction === Reaction.TRANSFORM) Object.assign(monster, { mood: Mood.BAT, lift: 0 });
            else Object.assign(monster, { mood: Mood.FLEE, trail: 0 });
            break;
          case Mood.COLLAPSED:
            if (monster.timer <= 0) Object.assign(monster, { mood: Mood.FLEE, trail: 0 });
            break;
          case Mood.FLEE:
            monster.x += monster.facing * FLEE_SPEED * step;
            monster.trail += step;
            if (monster.x < -EDGE || monster.x > width + EDGE) hide(monster);
            break;
          case Mood.VANISH:
            if (monster.timer <= 0) hide(monster);
            break;
          case Mood.BAT:
            monster.x += monster.facing * FLEE_SPEED * 0.8 * step;
            monster.lift += BAT_LIFT * step;
            if (monster.lift > ROWS || monster.x < -EDGE || monster.x > width + EDGE) hide(monster);
            break;
          case Mood.HIDDEN:
            if (monster.timer <= 0) Object.assign(monster, { mood: Mood.EMERGE, timer: TIMING.emerge, x: doorX, lift: 0, facing: Math.random() < 0.5 ? -1 : 1 });
            break;
          case Mood.EMERGE:
            if (monster.timer <= 0) Object.assign(monster, { mood: Mood.WANDER, turnIn: TIMING.turnMin });
            break;
        }
      }
    }

    // A monster is coming out, or about to.
    function door() {
      return monsters.some((monster) => monster.mood === Mood.EMERGE || (monster.mood === Mood.HIDDEN && monster.timer < 0.3)) ? Door.OPEN : Door.SHUT;
    }

    function frameOf(monster, time) {
      const { art, speed } = monster.kind;
      const pace = monster.mood === Mood.FLEE ? 10 : Math.max(2, speed * 0.6);
      return art[Math.floor(time * pace) % art.length];
    }

    function feetOf(monster, time) {
      const { gait } = monster.kind;
      if (gait === Gait.FLOAT) return monster.lane - 3 + Math.round(Math.sin(time * 3 + monster.kind.offset) * 1.5);
      if (gait === Gait.HOP) return monster.lane - Math.round(Math.abs(Math.sin(time * (monster.mood === Mood.FLEE ? 9 : 4))) * 3);
      return monster.lane;
    }

    function draw(surface, time) {
      const visible = monsters.filter((monster) => monster.mood !== Mood.HIDDEN).sort((a, b) => a.lane - b.lane);
      for (const monster of visible) {
        const flip = monster.facing < 0 ? Flip.HORIZONTAL : Flip.NONE;
        const x = Math.round(monster.x);
        let feet = feetOf(monster, time);

        if (monster.mood === Mood.COLLAPSED) {
          surface.stand(ART.bones[0], x, monster.lane, { flip });
          continue;
        }

        if (monster.mood === Mood.BAT) {
          surface.stand(ART.bat[Math.floor(time * 12) % 2], x, Math.round(feet - 8 - monster.lift));
          continue;
        }

        if (monster.mood === Mood.FLEE && monster.kind.reaction === Reaction.UNRAVEL) {
          const length = Math.min(36, Math.round(monster.trail * 50));
          for (let step = 1; step <= length; step += 1) surface.put(x - monster.facing * (2 + step), feet - 7 + Math.round(Math.sin(step * 0.6 + time * 8)) + Math.floor(step / 6), step % 3 ? 'l' : 'm');
        }

        const art = frameOf(monster, time);
        const startled = monster.mood === Mood.STARTLED;
        if (startled) feet -= JUMP[monster.kind.reaction] ?? 2;
        const fading = monster.mood === Mood.VANISH || monster.mood === Mood.EMERGE;
        surface.stand(art, x, feet, { flip, fill: fading ? Fill.DITHER : Fill.SOLID, phase: Math.floor(time * 12) });
        if (startled) surface.stand(ART.alarm, x, feet - art.height - 2);
      }
    }

    // Pick the front-most wandering monster under a band pixel.
    function hit(px, py, slop, time) {
      let found = null;
      for (const monster of monsters) {
        if (monster.mood !== Mood.WANDER) continue;
        const art = monster.kind.art[0];
        const left = monster.x - art.width / 2 - slop;
        const feet = feetOf(monster, time);
        if (px < left || px > left + art.width + slop * 2 || py < feet - art.height - slop || py > feet + slop) continue;
        if (!found || monster.lane > found.lane) found = monster;
      }
      return found;
    }

    // Run away from the pointer, in the monster's own style.
    function scare(monster, px, motion) {
      monster.facing = px < monster.x ? 1 : -1;
      if (motion === Motion.REDUCED) return hide(monster);
      if (monster.kind.reaction === Reaction.CRUMBLE) Object.assign(monster, { mood: Mood.COLLAPSED, timer: TIMING.collapsed });
      else Object.assign(monster, { mood: Mood.STARTLED, timer: TIMING.startled });
    }

    // Without motion, scared monsters come straight back where they stood,
    // and any caught mid-reaction resume their normal form.
    function settle() {
      for (const monster of monsters) Object.assign(monster, { mood: Mood.WANDER, lift: 0 });
    }

    return { resize, update, door, draw, hit, scare, settle };
  }

  // ── Gargoyle ──────────────────────────────────────────────────────────────

  const Flight = Object.freeze({ CRUISE: 'cruise', LANDING: 'landing', ROOST: 'roost', DART: 'dart', AWAY: 'away' });
  const GARGOYLE = {
    pixel: 3, // CSS px per sprite pixel
    cruise: 150, // CSS px per second
    dart: 520,
    steering: 2.6,
    margin: 32,
    arrival: 24,
    legMin: 3,
    legSpread: 4,
    legTimeout: 6,
    roostMin: 3,
    roostSpread: 4,
    awayMin: 8,
    awaySpread: 7,
    firstVisit: 2.5,
    flap: 11,
  };
  const FLAP_CYCLE = [0, 1, 2, 1];

  function createGargoyle(palette) {
    const [first] = ART.gargoyle;
    const canvas = document.createElement('canvas');
    canvas.className = 'carnival-flyer';
    canvas.width = first.width;
    canvas.height = first.height;
    canvas.style.width = `${first.width * GARGOYLE.pixel}px`;
    canvas.style.height = `${first.height * GARGOYLE.pixel}px`;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    const surface = createSurface(canvas.getContext('2d'), first.width, first.height, palette);
    const size = { width: first.width * GARGOYLE.pixel, height: first.height * GARGOYLE.pixel };

    const state = { flight: Flight.AWAY, timer: GARGOYLE.firstVisit, x: 0, y: 0, vx: 0, vy: 0, target: null, legs: 0, legTime: 0, facing: 1 };
    let drawn = { art: null, flip: Flip.NONE };
    let awake = false;

    const viewport = () => ({ width: document.documentElement.clientWidth, height: window.innerHeight });

    function randomSpot() {
      const { width, height } = viewport();
      const spot = () => ({
        x: GARGOYLE.margin + Math.random() * Math.max(1, width - GARGOYLE.margin * 2),
        y: GARGOYLE.margin + Math.random() * Math.max(1, height - GARGOYLE.margin * 2),
      });
      // Prefer the farther of two spots for long, sweeping passes.
      const [a, b] = [spot(), spot()];
      return Math.hypot(a.x - state.x, a.y - state.y) > Math.hypot(b.x - state.x, b.y - state.y) ? a : b;
    }

    function cruise() {
      Object.assign(state, { flight: Flight.CRUISE, target: randomSpot(), legs: GARGOYLE.legMin + Math.floor(Math.random() * GARGOYLE.legSpread), legTime: 0 });
    }

    // Fly in from a random edge.
    function enter() {
      const { width, height } = viewport();
      const side = Math.floor(Math.random() * 3);
      state.x = side === 0 ? -size.width : side === 1 ? width + size.width : Math.random() * width;
      state.y = side === 2 ? -size.height : Math.random() * height * 0.6;
      state.vx = 0;
      state.vy = 0;
      canvas.hidden = false;
      cruise();
    }

    function steer(step, time) {
      const dx = state.target.x - state.x;
      const dy = state.target.y - state.y;
      const distance = Math.hypot(dx, dy) || 1;
      const speed = Math.min(GARGOYLE.cruise, distance * 2);
      const blend = Math.min(1, step * GARGOYLE.steering);
      state.vx += ((dx / distance) * speed - state.vx) * blend;
      state.vy += ((dy / distance) * speed - state.vy) * blend;
      state.x += state.vx * step;
      // Bats jink as they fly.
      state.y += state.vy * step + Math.sin(time * 9) * 30 * step;
      return distance;
    }

    function update(step, time) {
      state.timer -= step;
      state.legTime += step;

      switch (state.flight) {
        case Flight.CRUISE: {
          const distance = steer(step, time);
          if (distance > GARGOYLE.arrival && state.legTime < GARGOYLE.legTimeout) break;
          state.legs -= 1;
          state.legTime = 0;
          if (state.legs > 0) {
            state.target = randomSpot();
            break;
          }
          // Head for the top edge to hang upside down for a while.
          state.flight = Flight.LANDING;
          state.target = { x: GARGOYLE.margin + Math.random() * Math.max(1, viewport().width - GARGOYLE.margin * 2), y: size.height / 2 };
          break;
        }
        case Flight.LANDING:
          if (steer(step, time) > 4 && state.legTime < GARGOYLE.legTimeout) break;
          Object.assign(state, { flight: Flight.ROOST, timer: GARGOYLE.roostMin + Math.random() * GARGOYLE.roostSpread, x: state.target.x, y: size.height / 2, vx: 0, vy: 0 });
          break;
        case Flight.ROOST:
          if (state.timer <= 0) cruise();
          break;
        case Flight.DART: {
          state.x += state.vx * step;
          state.y += state.vy * step;
          const { width, height } = viewport();
          if (state.x < -size.width || state.x > width + size.width || state.y < -size.height || state.y > height + size.height) {
            Object.assign(state, { flight: Flight.AWAY, timer: GARGOYLE.awayMin + Math.random() * GARGOYLE.awaySpread });
            canvas.hidden = true;
          }
          break;
        }
        case Flight.AWAY:
          if (state.timer <= 0) enter();
          break;
      }

      if (Math.abs(state.vx) > 5) state.facing = Math.sign(state.vx);
    }

    function render(time) {
      if (canvas.hidden) return;
      const roosting = state.flight === Flight.ROOST;
      const pace = state.flight === Flight.DART ? GARGOYLE.flap * 2 : GARGOYLE.flap;
      const art = roosting ? ART.roost[0] : ART.gargoyle[FLAP_CYCLE[Math.floor(time * pace) % FLAP_CYCLE.length]];
      const flip = (state.facing < 0 ? Flip.HORIZONTAL : Flip.NONE) | (roosting ? Flip.VERTICAL : Flip.NONE);
      if (art !== drawn.art || flip !== drawn.flip) {
        surface.erase();
        surface.blit(art, 0, 0, { flip });
        surface.present();
        drawn = { art, flip };
      }
      canvas.style.transform = `translate(${Math.round(state.x - size.width / 2)}px, ${Math.round(state.y - size.height / 2)}px)`;
    }

    // Dart away from the pointer, up and out of sight.
    canvas.addEventListener('pointerdown', (event) => {
      if (!awake || state.flight === Flight.DART) return;
      const away = Math.sign(state.x - event.clientX) || state.facing;
      Object.assign(state, { flight: Flight.DART, vx: away * GARGOYLE.dart, vy: -GARGOYLE.dart * 0.55 });
    });

    return {
      element: canvas,
      update,
      render,
      wake() { awake = true; },
      // Leave the page; it flies back in a while after waking.
      dismiss() {
        awake = false;
        Object.assign(state, { flight: Flight.AWAY, timer: GARGOYLE.firstVisit });
        canvas.hidden = true;
      },
    };
  }

  // ── Carnival ──────────────────────────────────────────────────────────────

  const HIT_SLOP = { mouse: 2, touch: 6 }; // band pixels of forgiveness
  // CSS px. Tickets hang in the sky below the pause button, leaving the
  // ground clear so the monster can be seen running away.
  const TICKET = { gap: 10, inset: 8, top: 44 };

  const canvas = band.querySelector('canvas');
  const context = canvas.getContext('2d');
  const pauseButton = band.querySelector('[data-carnival-pause]');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const palette = readPalette(band);
  const crowd = createCrowd();
  const gargoyle = createGargoyle(palette);
  document.body.append(gargoyle.element);

  let surface = null;
  let still = null;
  let centre = 0;
  let showTime = STILL_TIME;
  let frameRequest = 0;
  let lastFrame = 0;
  let bandVisible = true;
  let motion = Motion.FULL;
  let paused = readPaused();
  let ticket = null;
  let returnFocus = null;

  function readPaused() {
    try {
      return localStorage.getItem(PAUSE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function storePaused() {
    try {
      localStorage.setItem(PAUSE_KEY, String(paused));
    } catch {
      // Storage can be blocked; the choice then lasts for this page only.
    }
  }

  const animating = () => motion === Motion.FULL && !paused;

  function layout() {
    const width = Math.ceil(band.clientWidth / PIXEL);
    if (!width) return false;
    canvas.width = width;
    canvas.height = ROWS;
    surface = createSurface(context, width, ROWS, palette);
    centre = Math.floor(width / 2);
    paintStill(surface, centre);
    still = surface.snapshot();
    crowd.resize(centre, width);
    return true;
  }

  function drawBand() {
    if (!surface && !layout()) return;
    surface.restore(still);
    paintLively(surface, centre, showTime, crowd.door());
    if (motion === Motion.REDUCED) surface.stand(ART.roost[0], centre + SITE.house + HOUSE.left + 29, HORIZON - 51);
    crowd.draw(surface, showTime);
    surface.present();
  }

  function tick(now) {
    const step = lastFrame ? Math.min(MAX_STEP, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    showTime += step;
    crowd.update(step, centre + SITE.house + HOUSE.door);
    gargoyle.update(step, showTime);
    if (bandVisible) drawBand();
    gargoyle.render(showTime);
    frameRequest = requestAnimationFrame(tick);
  }

  function start() {
    if (frameRequest) return;
    lastFrame = 0;
    frameRequest = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
  }

  // Band pixel under a pointer event.
  function bandPoint(event) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return { x: ((event.clientX - box.left) * canvas.width) / box.width, y: ((event.clientY - box.top) * canvas.height) / box.height, box };
  }

  function monsterAt(event) {
    const point = bandPoint(event);
    if (!point) return null;
    const slop = event.pointerType === 'touch' ? HIT_SLOP.touch : HIT_SLOP.mouse;
    const monster = crowd.hit(point.x, point.y, slop, showTime);
    return monster && { monster, point };
  }

  function randomApp() {
    const links = [...document.querySelectorAll('[data-app] h2 a')];
    return links.length ? links[Math.floor(Math.random() * links.length)] : null;
  }

  function closeTicket() {
    if (!ticket) return;
    const hadFocus = ticket.contains(document.activeElement);
    ticket.remove();
    ticket = null;
    if (hadFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    if (!animating()) {
      crowd.settle();
      drawBand();
    }
  }

  // A ticket to a random app, placed beside the monster that dropped it.
  function openTicket(monster, point) {
    returnFocus = document.activeElement;
    ticket = document.createElement('div');
    ticket.className = 'carnival-ticket';
    ticket.setAttribute('role', 'dialog');
    ticket.setAttribute('aria-label', 'Carnival ticket');
    ticket.tabIndex = -1;

    const message = document.createElement('p');
    const app = randomApp();
    if (app) {
      const link = document.createElement('a');
      link.href = app.getAttribute('href');
      link.textContent = app.textContent;
      message.append(`${monster.kind.fled}, ${monster.kind.dropped} `, link, '.');
    } else {
      message.textContent = `${monster.kind.fled}.`;
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'carnival-ticket-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', closeTicket);

    ticket.append(message, close);
    band.append(ticket);

    const scale = point.box.width / canvas.width;
    const anchor = monster.x * scale;
    const right = anchor + TICKET.gap * PIXEL;
    const width = ticket.offsetWidth;
    const left = right + width + TICKET.inset <= band.clientWidth ? right : anchor - TICKET.gap * PIXEL - width;
    ticket.style.left = `${Math.max(TICKET.inset, Math.min(left, band.clientWidth - width - TICKET.inset))}px`;
    ticket.style.top = `${TICKET.top}px`;
    ticket.focus({ preventScroll: true });
  }

  canvas.addEventListener('pointermove', (event) => {
    canvas.toggleAttribute('data-hot', Boolean(monsterAt(event)));
  });
  canvas.addEventListener('pointerleave', () => canvas.removeAttribute('data-hot'));
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const found = monsterAt(event);
    if (!found) return;
    // Keep the document listener below from closing the new ticket, and the
    // mouse default from moving focus off it.
    event.stopPropagation();
    event.preventDefault();
    // Close first: without motion, closing returns scared monsters, this one included.
    closeTicket();
    crowd.scare(found.monster, found.point.x, animating() ? Motion.FULL : Motion.REDUCED);
    canvas.removeAttribute('data-hot');
    openTicket(found.monster, found.point);
    if (!animating()) drawBand();
  });

  document.addEventListener('pointerdown', (event) => {
    if (ticket && !ticket.contains(event.target)) closeTicket();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTicket();
  });

  function setPaused(value) {
    paused = value;
    pauseButton.textContent = paused ? 'Resume carnival' : 'Pause carnival';
    storePaused();
    applyMotion();
  }

  // Reduced motion shows one still frame with the gargoyle perched on the
  // house. Pausing freezes the band; the gargoyle leaves rather than hang
  // motionless over the page.
  function applyMotion() {
    motion = motionQuery.matches ? Motion.REDUCED : Motion.FULL;
    pauseButton.hidden = motion === Motion.REDUCED;
    stop();

    if (motion === Motion.REDUCED) {
      showTime = STILL_TIME;
      crowd.settle();
    }

    if (animating()) {
      gargoyle.wake();
      start();
      return;
    }

    gargoyle.dismiss();
    drawBand();
  }

  pauseButton.addEventListener('click', () => setPaused(!paused));
  motionQuery.addEventListener('change', applyMotion);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (layout() && !animating()) drawBand();
    }, RESIZE_DELAY_MS);
  });

  // Skip drawing the band while it is scrolled out of view.
  new IntersectionObserver(([entry]) => {
    bandVisible = entry.isIntersecting;
  }).observe(band);

  band.hidden = false;
  pauseButton.textContent = paused ? 'Resume carnival' : 'Pause carnival';
  layout();
  applyMotion();
})();
