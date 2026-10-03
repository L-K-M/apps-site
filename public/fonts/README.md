# Bundled fonts

Syne is used for headings; Instrument Sans is used for body text and controls.
Both are self-hosted variable WOFF2 fonts, with the full upstream character sets.
No font request goes to Google at runtime or during site generation.

| File | Weights | Source |
|---|---|---|
| `syne-variable.woff2` | 400–800 | [`Syne[wght].ttf`](https://github.com/google/fonts/blob/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/syne/Syne%5Bwght%5D.ttf) |
| `instrument-sans-variable.woff2` | 400–700 | [`InstrumentSans[wdth,wght].ttf`](https://github.com/google/fonts/blob/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf) |

Fonts retain their SIL Open Font License 1.1, independent of the application's
Unlicense. The copyright notices and licenses are in `OFL-syne.txt` and
`OFL-instrument-sans.txt`; both are copied into the generated site.

The upstream TrueType fonts are converted to WOFF2 with FontTools 4.66.1, retaining
names, glyphs, variation axes and license metadata. The generator uses the
committed files directly; it does not need Python or FontTools.

To refresh, download the pinned source fonts above and convert each with
`fonttools ttLib.woff2 compress SOURCE.ttf -o TARGET.woff2`. Keep the matching
licenses with the font files and recheck browser rendering.
