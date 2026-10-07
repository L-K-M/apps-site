# Bundled fonts

Pirata One sets the site wordmark, C64 Keyboard sets app names and headlines,
and Instrument Sans sets body text and controls. All are self-hosted WOFF2 fonts
with their full upstream character sets. No remote font requests are needed.

C64 Keyboard 1.107 reconstructs Commodore 64 keycap lettering. Lowercase input
renders as capitals; app text retains its original casing. Unsupported characters
use system fallback fonts.

| File | Weights | Source |
|---|---|---|
| `pirata-one-regular.woff2` | 400 | [`PirataOne-Regular.ttf`](https://github.com/google/fonts/blob/90abd17b4f97671435798b6147b698aa9087612f/ofl/pirataone/PirataOne-Regular.ttf) |
| `c64-keyboard-regular.woff2` | 400 | [`C64Keyboard-Regular.woff2`](https://github.com/szabadkai/c64-keyboard-font/blob/5b043911830c8dd035ec166993511c8e32532117/fonts/C64Keyboard-Regular.woff2) |
| `instrument-sans-variable.woff2` | 400–700 | [`InstrumentSans[wdth,wght].ttf`](https://github.com/google/fonts/blob/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf) |

Pirata One and Instrument Sans retain their SIL Open Font License 1.1, independent
of the application's Unlicense. Their copyright notices and licenses are in
`OFL-pirata-one.txt` and `OFL-instrument-sans.txt`.

C64 Keyboard's pinned revision has no explicit license file or embedded license.
Its provenance is recorded in `c64-keyboard-NOTICE.txt`; the application's
Unlicense does not apply to this third-party font. The notice and OFL files are
copied into the generated site.

Pirata One and Instrument Sans are converted from upstream TrueType fonts with
FontTools 4.66.1, retaining names, glyphs, variation axes and license metadata.
C64 Keyboard uses the upstream WOFF2 unchanged. The generator uses committed
files directly; it does not need Python or FontTools.

To refresh, download the pinned sources above. Convert the TrueType fonts with
`fonttools ttLib.woff2 compress SOURCE.ttf -o TARGET.woff2`. Keep the matching
licenses and notices with the font files and recheck browser rendering.
