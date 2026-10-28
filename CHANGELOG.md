# Changelog

## Unreleased

- Add Leaflit's library, reader and login screenshots from its website.

- Let the carnival's gargoyle react to a mouse pointer: it follows the pointer with its eyes, circles it for a few seconds when it moves nearby, and wakes from its roost when it creeps close. Touch screens are unaffected.

- Hide Starling from the directory.

- Add screenshots for Amberfader, Asterinked, Baegun, BangniDraw, Chess & Cocoa, Combray, Copywraith, Eko, GitEnough, Kirsch, Meltorama 2000, Monkey's Paw, Neutrodyne, Pararena 2, Planchette, Poltergeist, QRat, RelayBar Scion and Spots. Apps without one upstream were captured from their own UI with sample data.

- Add Chess & Cocoa, Claude Replicant, Combray, Neutrodyne, RunningMan and Sweetbriar to the catalogue, completing a new audit of all 78 public L-K-M repositories.

- Drop app icons from directory cards, so names such as BootCaptain no longer split mid-word; detail pages keep them. Widen the page and the gutters between cards.

- Add Coreography, a graph-first Mac system monitor, and Foldover, a Mac folder sync app, to the catalogue.

- Hide OpenCodeQuota Widget, Manors & Menaces, Scratch, Expand URL, ia-get, ImageContentDetector, Mirio, opencode-mystatus and the Shiori, Hoarder and Hoarder's Pipette mirrors from the directory. The ia-get Docker Wrapper stays listed.

- Ship credits and MIT license texts for the starter catalogue's three third-party images in the site as `assets/media-credits.txt`.

- Add Monkey's Paw, a Markdown prompt picker for macOS, Linux and Android, to the catalogue.

- Add a puzzle to the carnival prize: scare five monsters in the right order before claiming. The claim carries a key made from the order; `carnival-key` prints the key for the prize server's `GIVEAWAY_KEY`, and an optional `carnivalPrize.riddle` hints at the order.

- Hide a high striker game in the carnival. Three rings in a row win an invite to Manors & Menaces when `carnivalPrize` points at a server's giveaway endpoint.

- Add a pixel-art haunted carnival beneath the directory. Clicked monsters flee and drop a ticket to a random app, also from the keyboard via a Scare a monster button; a gargoyle roams the page. Reduced motion shows a still scene and a button pauses the animation.

- Keep app names and icons together; wrap maturity labels at tight card widths.

- Increase vertical spacing between app entries.

- Add red/amber/green traffic-light dots beside maturity labels on cards and detail pages.

- Replace platform names on cards and detail pages with accessible, self-hosted SVG icons.

- Use C64 Keyboard for app names and headlines, retaining the blackletter site wordmark.

- Rename the site to Cabinet of Curiosities with a blackletter wordmark, ornament rules and a keyhole favicon.

- Point Hauntware download links at the published suite releases, replacing standalone repository links.

- Use merged Hauntware source/docs links while retaining available standalone downloads.

- Populate app maturity with reasoned estimates, preserving existing author assessments.

- Add per-app `status: visible/hidden` publication control; hide pages, media and exports on rebuild.

- Generate a static app directory from repo-local and central JSON manifests.
- Support monorepos, web-only apps, explicit maturity, and platform inference.
- Bundle local media; render detail pages, search, and category/platform filters.
- Include a 64-app public-repository catalogue, CLI, Compose deployment, and CI checks.
- Group Séance, Poltergeist and Planchette in a Hauntware manifest with a repo-ready example.
- Support browser-extension, Pebble and RG Nano platform labels and filters.
