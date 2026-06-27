# Contributing to O-Tie

Thanks for your interest in improving O-Tie. This guide covers local setup, the
checks we run, how to regenerate documentation assets, and the release process.

## Prerequisites

- Node.js 20+ and npm
- Obsidian 1.4.0+ (for manual testing)

## Setup

```bash
npm install
```

## Develop

```bash
npm run dev      # esbuild watch -> main.js
npm run build    # type-check (tsc) + production bundle
npm run lint     # ESLint with the Obsidian plugin guideline rules
npm test         # unit tests (model + layout)
```

To test inside a real vault, point the deploy helper at your plugin folder:

```bash
OBSIDIAN_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/o-tie" npm run deploy
```

`npm run lint`, `npm run build`, and `npm test` must all pass before a change is
merged or released — these mirror the automated checks Obsidian runs on the
community directory.

## Regenerating documentation assets

The README screenshots and the example `.bowtie` files are generated from the
plugin's real layout engine and stylesheet, so they always match the current
behaviour.

```bash
npx playwright install chromium   # one time, for screenshots
npm run screenshots               # -> assets/*.png
npm run examples                  # -> examples/*.bowtie
```

## Release process

Obsidian requires the GitHub release tag to match `manifest.json` exactly
(e.g. `1.0.8`, not `v1.0.8`).

1. Run `npm run lint`, `npm run build`, and `npm test`.
2. Complete the QA checklist below.
3. Bump the version: `npm version patch` (updates `manifest.json` and
   `versions.json` via `version-bump.mjs`).
4. Update `CHANGELOG.md`.
5. Push the tag: `git push origin <version>`. The release workflow builds and
   attaches `main.js`, `manifest.json`, and `styles.css`.

### Manual QA checklist

Mobile regressions have driven most past patch releases, so test on a phone or
tablet as well as desktop before every release.

Desktop:

- [ ] Create a new bowtie; rename it via the toolbar title.
- [ ] Add a threat, consequence, event, and barrier from the toolbar.
- [ ] Add a prevention/mitigation/between-events barrier via lane `+` buttons.
- [ ] Add a barrier analysis stack row; change a preset value; add a custom row.
- [ ] Add a degradation factor and a safeguard.
- [ ] Edit a label inline (double-click) and notes (inspector).
- [ ] Undo/redo (toolbar and Ctrl+Z / Ctrl+Y).
- [ ] Pan (drag), zoom (wheel), and Fit.
- [ ] Export as image (full diagram and visible area), with/without grid.
- [ ] Delete nodes; confirm autosave writes to the `.bowtie` file.
- [ ] Open a deliberately malformed `.bowtie` file: a notice appears and the
      file is not overwritten.

Mobile (phone and tablet):

- [ ] One-finger pan and two-finger pinch zoom.
- [ ] Overlay `+` / `×` controls appear at node corners and stay circular after zoom.
- [ ] Add and delete nodes via overlay controls.
- [ ] App swipe gestures do not fire while interacting with the canvas.

## GitHub repository topics

For discoverability, the repository should carry these topics:

```
obsidian, obsidian-plugin, bowtie, risk-management, process-safety, hse, barrier-management, risk-analysis
```

A maintainer can set them with:

```bash
gh repo edit --add-topic obsidian,obsidian-plugin,bowtie,risk-management,process-safety,hse,barrier-management,risk-analysis
```
