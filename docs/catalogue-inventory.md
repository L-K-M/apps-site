# Catalogue inventory

Audited all 68 public repositories at [github.com/L-K-M](https://github.com/L-K-M)
on 2026-10-03. The catalogue has 64 distinct apps: 61 from those repositories
and the existing Dwindle, Mirio and QRat web entries.

[`public-repositories.json`](public-repositories.json) records every repository's
app ids or exclusion reason. CI checks that all mapped metadata entries exist, no duplicates
are introduced, and Leaflit stays excluded.

Publication is separate from inventory coverage: set an app's `status` to
`hidden` to keep its metadata while excluding it from the generated site.
Browser fixtures exercise the complete audited reference catalogue, independent
of those publication choices.

## Selection

- Include desktop, mobile, browser, watch and command-line apps, self-hosted
  services, firmware and explicitly unfinished app projects.
- Include functional forks and upstream mirrors, identifying their provenance
  in descriptions and tags.
- Exclude component libraries, configuration bundles, CI integrations, the
  directory generator itself, and license-only placeholders.
- Keep existing publicly accessible web apps even without a public source repo.
  Dwindle and QRat no longer expose non-public GitHub source links.
- Retain author-stated maturity; otherwise provide a best-effort estimate marked
  `Estimated:` in `maturityNote`, using documented workflows and known limitations.
  A version number or published release alone does not establish maturity.

Descriptions, platforms and media come from public READMEs and build metadata.
Download links are supplied only for repositories with a verified public release.
Several READMEs advertise a latest-release link even though no release exists;
those entries have source links instead.

The account audit also verified [Starling 3.1.3](https://github.com/L-K-M/FunKey-OS-Starling/releases/tag/Starling-3.1.3),
[Séance 0.9.2](https://github.com/L-K-M/Seance/releases/tag/v0.9.2), and
[Poltergeist 1.0.1](https://github.com/L-K-M/Poltergeist/releases/tag/v1.0.1)
through the GitHub Releases API. Séance's iOS target is represented by an
unsigned IPA, not an App Store release. Browser targets for Hoarder's Pipette
are documented in its [Chrome and Firefox installation guide](https://dansnow.github.io/hoarder-pipette/guides/installation/).

Maturity estimates are editable judgements, not hands-on certification. Source-only
software can be usable; published builds can remain experimental. Distribution
status is considered alongside implemented workflows and documented limitations.

## Hauntware

`catalogue/hauntware.json` is one manifest containing Séance, Poltergeist and
Planchette under the shared Hauntware repository. Search for **Hauntware** to
find all three. Source and documentation links now use their merged subdirectories.
Standalone release links remain because Hauntware has not published a suite release.

[`examples/hauntware.json`](../examples/hauntware.json) is ready to copy to the
Hauntware repo root as `app-directory.json`. It uses the verified merged layout:

- `seance/app/seance_app`
- `poltergeist/app/poltergeist_app`
- `planchette/app/planchette_app`

The repo-local manifest then overrides the central entries by their existing
ids, uses app-specific source URLs in the shared repo, and infers each app's platforms from its
own Flutter directory. Existing standalone releases remain linked until
Hauntware publishes replacements.

## Updating this snapshot

The generator reads committed metadata; it does not call GitHub during a build.
For a later account audit, compare the public repository list with the inventory,
add or update entries, refresh media and update the audit date. Keep source paths
and screenshots repository-local when adopting a manifest in an app repo.
