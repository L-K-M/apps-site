# Bundled fonts

Pirata One sets the site wordmark, Syne is used for headings and Instrument Sans
is used for body text and controls. All are self-hosted WOFF2 fonts, with the
full upstream character sets. No font request goes to Google at runtime or
during site generation.

| File | Weights | Source |
|---|---|---|
| `pirata-one-regular.woff2` | 400 | [`PirataOne-Regular.ttf`](https://github.com/google/fonts/blob/90abd17b4f97671435798b6147b698aa9087612f/ofl/pirataone/PirataOne-Regular.ttf) |
| `syne-variable.woff2` | 400–800 | [`Syne[wght].ttf`](https://github.com/google/fonts/blob/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/syne/Syne%5Bwght%5D.ttf) |
| `instrument-sans-variable.woff2` | 400–700 | [`InstrumentSans[wdth,wght].ttf`](https://github.com/google/fonts/blob/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf) |

Fonts retain their SIL Open Font License 1.1, independent of the application's
Unlicense. The copyright notices and licenses are in `OFL-pirata-one.txt`,
`OFL-syne.txt` and `OFL-instrument-sans.txt`; all are copied into the generated
site.

The upstream TrueType fonts are converted to WOFF2 with FontTools 4.66.1, retaining
names, glyphs, variation axes and license metadata. The generator uses the
committed files directly; it does not need Python or FontTools.

To refresh, download the pinned source fonts above and convert each with
`fonttools ttLib.woff2 compress SOURCE.ttf -o TARGET.woff2`. Keep the matching
licenses with the font files and recheck browser rendering.
