# Catalogue media

## Mac screenshot privacy review

Every screenshot used by a published Mac-app entry is recorded in
[`docs/macos-screenshots.json`](../../docs/macos-screenshots.json), reviewed on
2026-10-28. Each record describes the exact source, sample content and SHA-256 of
its image. The catalogue test rejects a missing local image or a changed image
whose pixels have not been reviewed and its hash updated. Hidden entries are
outside the published-site review. Some cross-platform apps show their existing
Linux or Android interface; those captures are identified in captions or provenance.

New captures use the actual app views with invented models or empty isolated
defaults. Account services, scanners, watchers and live user stores are disconnected.
Only the supplied app view/window is captured. ScreenCaptureKit captures, where
used, request the current process only and filter the exact synthetic window;
they do not grant screen recording or include other apps, the desktop or menu bar.
Other captures render the supplied view to a bitmap. The Foldover image is an
app-window crop of the official fixture UI-tour artifact. No personal-data
blurring, pixel replacement or image-generated imitation is used.

The retained images are distinguished honestly: source-verified fixtures,
previously documented sample captures, simulation state, generated artwork and
public demonstration content. For example, Lucerne shows its default sample
letter, DockVac uses fake-Docker fixtures, and Lantenna uses mock device fixtures.
ShrinkPub and Vervellum show generic public demonstration content; their original
fixture definitions or responses were not independently reproduced. Their exact
visible content and those limits are recorded in the review. A hash ties that
review to the pixels; it cannot detect personal data automatically.

## Native and refreshed captures, 2026-10-28

| File | Source | Sample content / method |
|---|---|---|
| alan.png | `Alan@177004f` | Built-in border preview; sample colours and geometry, isolated defaults |
| bootcaptain.png | `BootCaptain@1fd84a9` | Six invented startup items; no scan |
| claude-replicant.png | `Claude-Replicant@262f31c` | Four invented profiles and fake processes/bundles; no accounts |
| coreography.png | `Coreography@bc5d6d1` | Injected CPU/memory time series; no host telemetry |
| foldover.png | `Foldover@8c6885f` | Official UI-tour fixture artifact; app-window crop only |
| gans.png | `Gans@f7ca420` | Invented services and RFC public test-secret codes |
| invoque.png | `Invoque@b2f649b` | Inert application/command result fixtures in the real panel |
| jetty.png | `Jetty@0afc765` | Appearance controls with factory defaults; no Dock controller |
| llimit.png | `LLimit@1cd1a64` | SampleSnapshotFactory quota dashboard at a fixed time |
| obtainintosh.png | `Obtainintosh@7c30fa2` | Real frontend, mocked IPC, five invented apps, local-only browser requests |
| pict.png | `Pict@8ce4456` | Five fabricated applications and generated SF Symbol icons |
| rememoru.png | `Rememoru@6eaa253` | Unchanged native menu builder; invented saved-layout status |
| repomen.png | `RepoMen@726ca23` | Six invented project artifacts; no scan or cleanup |
| seance.png | `Hauntware@814e102` | Existing server-list widget fixture; fake example-domain SSH hosts |
| shortking.png | `Shortking@d4bf50b` | Eight fabricated shortcut claims; no inventory scan |
| sion.png | `Sion@8816738` | Generated Mermaid creative-workflow document in the real editor |
| sortomat.png | `Sortomat@02d66be` | Three invented file plans and sample rules; automation disabled |
| sweetbriar.png | `Sweetbriar@b1be23d` | Production archive list with an inert bridge and eight invented messages |
| tiltburst.png | `Tiltburst@aebd31e` | Source renderer preview of committed Neon Drift vector art; fixed sample lighting, temporary Metal loader/upload adapters; game in development |
| topdrawer.png | `TopDrawer@dd27e91` | Built-in synthetic Apps drawer preview and isolated factory defaults |
| vaultsquire.png | `VaultSquire@be17a0c` | Four example-domain login projections; no providers or credentials |
| wrapybara.png | `Wrapybara@8dca132` | New-wrap form seeded with Example Notes and example.com; no web session |
| zap.png | `Zap@e8ec18c` | Three invented apps and generated icons; no app/window inventory |
| zen-backup-manager.png | `ZenBackupManager@14efe44` | Invented backup record and example-domain page previews; no session files |

Capture harnesses are in [`scripts/screenshots/`](../../scripts/screenshots/).
Check out the exact source revision recorded in the privacy review before
rerunning a capture. Native scripts require macOS and Apple Command Line Tools;
the SwiftUI source-view harnesses use the macOS 26.5 SDK because the 27.0 CLT SDK lacks
the SwiftUI macro plugin. Flutter and browser captures also require their
respective SDK or Playwright Chromium. Examples, run from the repository root:

```sh
python3 scripts/screenshots/native-capture.py repomen
python3 scripts/screenshots/capture-invoque.py ../Invoque
python3 scripts/screenshots/capture-rememoru.py ../Rememoru
python3 scripts/screenshots/capture-sion.py ../Sion
python3 scripts/screenshots/capture-sortomat.py ../Sortomat
python3 scripts/screenshots/capture-sweetbriar.py ../Sweetbriar
python3 scripts/screenshots/capture-vaultsquire.py ../VaultSquire
python3 scripts/screenshots/privacy/capture.py gans wrapybara zen-backup-manager
python3 scripts/screenshots/privacy/capture-llimit.py
```

The native runner also accepts `bootcaptain`, `coreography`, `jetty` and
`topdrawer`. The privacy runner also accepts `pict` and `zap`. The Séance,
Obtainintosh and Tiltburst harnesses carry their additional setup in their
script comments. The Tiltburst image is a source renderer preview, not a gameplay capture. Its
standalone harness executes the committed ArtRenderer and MSL shaders. A temporary
SdfBatch copy adapts Metal shader selection, CPU/shader instance serialization and
GPU transfer ordering; the authored table art and shaders are unchanged. The
original source repository stays pristine. The capture was rerun with assertions
enabled. Review every regenerated image before changing its audit hash.

## Retained upstream snapshots and icons

The original snapshots were collected on 2026-10-02, with the public-repository
expansion on 2026-10-03. The Monkey's Paw icon was added on 2026-10-20. The
Chess & Cocoa, Combray, Coreography, Foldover, Neutrodyne, RunningMan and
Sweetbriar icons/images, asterinked.jpeg, chess-and-cocoa.png, meltorama.jpeg,
monkeys-paw.png and relaybar-scion.png were collected on 2026-10-27. This table
contains only retained upstream bytes; replaced screenshots appear above.
Icons are resized to at most 192 px. Repo-local manifests may override catalogue
entries and need their own image review.

Leaflit's website screenshots were collected unchanged on 2026-10-28.

| File | Source |
|---|---|
| dwindle-light.png | `Dwindle/docs/screenshot-light.png` |
| dwindle-dark.png | `Dwindle/docs/screenshot-dark.png` |
| finsical.png | `Finsical/media-sources/screenshot.png` |
| lantenna.png | `Lantenna/media-sources/screenshot.png` |
| vervellum.png | `Vervellum/media-sources/screenshot.png` |
| wordwarp.png | `WordWarp/media-sources/screenshot.png` |
| asterinked.jpeg | `Asterinked/media-sources/screenshot.jpeg` |
| bangnidraw-icon.png | `BangniDraw/media-sources/icon.png` |
| blipbird.png | `Blipbird/media-sources/screenshots.png` |
| bootcaptain-icon.png | `BootCaptain/App/Assets.xcassets/AppIcon.appiconset/icon_128x128@2x.png` |
| chess-and-cocoa-icon.png | `ChessAndCocoa/media-sources/icon.png` |
| chess-and-cocoa.png | `ChessAndCocoa/docs/screenshots/game.png` |
| combray-icon.png | `Combray/media-sources/icon.png` |
| coreography-icon.png | `Coreography/media-sources/icon.png` |
| dockvac.png | `DockVac/docs/screenshots/02-report.png` |
| dockvac-icon.png | `DockVac/media-sources/icon.png` |
| foldover-icon.png | `Foldover/media-sources/icon.png` |
| invoque-icon.png | `Invoque/media-sources/icon2.png` |
| kararead.jpeg | `Kararead/screenshots/reader.jpeg` |
| leaflit-library.jpg | https://leafl.it/assets/library.jpg |
| leaflit-reader.png | https://leafl.it/assets/reader.png |
| leaflit-login.png | https://leafl.it/assets/login.png |
| lucerne.png | `Lucerne/screenshot.png` |
| meltorama.jpeg | `Meltorama2000/media-sources/screenshot1.jpeg` |
| monkeys-paw-icon.png | `MonkeysPaw/media-sources/icon.png` |
| monkeys-paw.png | `MonkeysPaw/docs/screenshots/picker-macos.png` |
| neutrodyne-icon.png | `Neutrodyne/desktopApp/icons/png/neutrodyne-512.png` |
| opencode-quota-widget.png | `OpenCodeQuotaWidget/screenshot.png` |
| relaybar-scion.png | `RelayBar/docs/screenshots/relaybar-tunnels.png` |
| runningman.png | `RunningMan/docs/images/overview.png` |
| shrinkpub.png | `ShrinkPub/media-sources/screenshot.png` |
| sweetbriar-icon.png | `Sweetbriar/media-sources/icon.png` |
| vaultsquire-icon.png | `VaultSquire/media-sources/icon.png` |
| danvers.png | `Danvers/screenshot.png` |
| game-and-pebble.png | `Game-and-Pebble/tools/preview.png` |
| ia-get-docker.png | `ia-get-docker/screenshot.png` |
| kagi-x-karakeep.png | `kagi-x-karakeep/screenshot.png` |
| lern-deutsch-pebble.png | `Lern-Deutsch--Pebble/tools/preview.png` |
| opencode-mystatus.png | `opencode-mystatus/assets/screenshot.png` |
| rssspy.png | `rssspy/screenshot.png` |
| scratch-icon.png | `scratch/docs/app-icon.png` |
| scratch.png | `scratch/docs/screenshot.png` |
| shiori-web-ext.png | `shiori-web-ext/docs/screenshot.png` |
| skip-that-noise.png | `skip-that-noise/img-src/screenshot.png` |
| whatsapp-backup.png | `whatsapp-backup/screenshot.png` |
| repomen-icon.png | `RepoMen/RepoMen/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-256.png`, resized to 192 px |

Five images show work from upstream projects that L-K-M forked, not L-K-M's own.
`scratch.png` (unchanged) and `scratch-icon.png` (resized) are by Eric Li, from
[erictli/scratch](https://github.com/erictli/scratch), MIT License. `shiori-web-ext.png`
(unchanged) is by Radhi Fadlillah, from
[go-shiori/shiori-web-ext](https://github.com/go-shiori/shiori-web-ext), MIT License,
Copyright (c) 2019-present Radhi Fadlillah. `pararena2.png` shows John Calhoun's game
graphics from [softdorothy/pararena_2](https://github.com/softdorothy/pararena_2), MIT
License, Copyright (c) 2016 softdorothy. `relaybar-scion.png` (unchanged) is by Lingxi
Shang, from [lx2026/RelayBar](https://github.com/lx2026/RelayBar), MIT License,
Copyright (c) 2026 RelayBar contributors. Their credits and license texts are in
[`public/media-credits.txt`](../../public/media-credits.txt), which the generator copies
into the site as `assets/media-credits.txt`. Keep that file in step when adding images
from other projects.

## Earlier sample captures

On 2026-10-27 and 28 the following apps' own UI code was run on Linux at the
listed commit and its rendered output captured. The data is sample data; the
app pixels were not edited. These existing captures are retained.

| File | Source | Method and sample data |
|---|---|---|
| amberfader.png | `Amberfader@069b023` | PySide6 main window grabbed offscreen; sample track |
| baegun.png | `Baegun@7e4d1bf` | Built frontend in Chromium, mocked Tauri IPC; sample conversion queue |
| bangnidraw.png | `BangniDraw@46b40ce` | Desktop app under Xvfb; landscape painted with the app's brush and fill tools via scripted input |
| combray.png | `Combray@380f2f0` | Recent sheet rendered by Robolectric from a seeded database; sample pages on example domains |
| copywraith.png | `Copywraith@39bdc1f` | Frontend in Chromium, mocked Tauri IPC; sample clipboard entries |
| eko.png | `Eko@8031ee8` | Android companion's Compose UI rendered by Robolectric; two sample paired Macs |
| gitenough.png, gitenough-changes.png | `GitEnough@c0e079f` | Linux GTK 4 port under Xvfb; demo repository |
| kirsch.png | `Kirsch@8db0bbe` | Review screen rendered by Robolectric; synthetic landscape print as the scan |
| neutrodyne.png | `Neutrodyne@babd24b` | Desktop app under Xvfb; six invented podcasts served locally, subscribed by OPML import |
| pararena2.png | `Pararena2@eb3b932` | SDL3 port under Xvfb; computer against computer |
| planchette.png | `Hauntware@814e102` | Flutter widget test of the app root; sample Compose file |
| poltergeist.png | `Hauntware@814e102` | Flutter widget test of the app root; fake remote file system |
| qrat.png | https://qrat.love | Live site in Chromium after Surprise me, page margins cropped |
| spots.png | `Spots@1f62b6c` | Home screen rendered by Robolectric; demo drive switched on, cue colour set darker |
