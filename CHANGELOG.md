# Changelog

All notable changes to O-Tie are documented here.

## [1.0.12] — 2026-06-27

### Fixed

- **Inspector label field** — The label input now auto-expands vertically like the notes field, so long text is fully visible while editing.
- **Multiline node labels** — Line breaks entered in the inspector or inline editor are shown on diagram nodes, and node height grows to fit.
- **Inline label edit** — Clearing a label with delete/backspace now commits correctly; inline edit uses a textarea so multiline labels match the inspector.
- **Pan from nodes** — Drag-pan works when the pointer starts on a node (mouse, touch, or pen), not only on empty canvas space.
- **Node tap/click** — A tap or click without movement still selects the node and opens the inspector bar after the pan-on-node fix.

---

## [1.0.11] — 2026-06-27

### Changed

- **Toolbar add buttons** — + Threat, + Consequence, + Event, and + Barrier now use the same neutral style as Fit (no green highlight on hover) and capitalised labels.

---

## [1.0.10] — 2026-06-27

### Fixed

- **Fit** — The Fit command now zooms out far enough to show the entire diagram; large bowties are no longer clipped by an artificial minimum zoom floor.
- **Node selection** — Single-clicking a node again opens the bottom inspector bar and selected-state controls (regression from 1.0.8).
- **CSS lint** — Removed `!important` overrides by increasing selector specificity for invalid settings inputs and hidden overlay controls.
- **Lint** — Filename sanitisation no longer needs an eslint-disable directive.

---

## [1.0.9] — 2026-06-27

### Fixed

- **Inline rename** — Pressing `Escape` now reliably cancels a label edit instead of saving it, and pressing `Enter` commits exactly once (no duplicate undo step or extra redraw).
- **Malformed file recovery** — A `.bowtie` file missing barrier arrays (for example, a threat without `preventionBarriers`) is now repaired on open instead of being rejected as malformed.
- **Corrupt view state** — Diagram zoom/pan is sanitised on load, preventing an invisible canvas or a broken image export from an out-of-range or non-numeric zoom.
- **File naming** — New bowtie and exported image names are hardened against dot-only names, trailing dots, and Windows reserved names.

### Changed

- Internal/build: aligned `esbuild` with the version required by the test toolchain so `npm ci` resolves a single version on CI (also clears a dev-only advisory), and added a two-event example screenshot to the README.

---

## [1.0.8] — 2026-06-27

### Added

- **Pan from anywhere on touch** — Single-finger drags now pan the canvas even when the finger starts on a node; a tap still selects the node.
- **Keyboard node selection** — Nodes are focusable (`Tab`), selectable with `Enter`/`Space`, and clearable with `Escape`.
- **Settings validation** — Numeric layout settings reject invalid input with clear visual feedback instead of silently ignoring it.
- **Unit tests and CI** — Vitest coverage for the model, layout, and pan/zoom logic, plus a GitHub Actions workflow running lint, type-check, tests, and build.

### Fixed

- **Data-loss guard** — A malformed `.bowtie` file no longer gets overwritten by an empty diagram; the original content is preserved and a notice is shown.

### Changed

- Internal: split the editor view into focused modules (history, pan/zoom, stack rows, external sync) and refreshed the README, examples, and contributor docs.

---

## [1.0.7] — 2026-06-23

### Fixed

- **Mobile node icon placement** — Overlay +/× buttons align with node corners, matching the desktop corner-offset layout.

---

## [1.0.6] — 2026-06-23

### Fixed

- **Mobile icon sizing** — Overlay + buttons now scale with canvas zoom so they stay proportional after Fit or pinch zoom.
- **Canvas touch capture** — Single-finger touches on the bowtie canvas block Obsidian app swipe gestures; the finger is reserved for panning.

---

## [1.0.5] — 2026-06-23

### Fixed

- **Mobile + buttons** — Round icon controls render in an unscaled overlay layer on mobile so pan/zoom no longer stretches them into ovals.
- **False sync notices** — Removed the repeated "updated elsewhere" toast; remote changes reload silently only when diagram content actually differs.

---

## [1.0.4] — 2026-06-23

### Fixed

- **Mobile + buttons** — Disable CSS `zoom` on mobile (it distorts circular buttons in WebKit) and lock button width/height with min/max constraints.
- **Mobile pan** — Call `preventDefault` on touch pointer events so Obsidian side menus do not open while panning the canvas.

---

## [1.0.3] — 2026-06-23

### Fixed

- **Mobile + buttons** — Lane and node add controls keep a circular shape on phone and tablet by overriding mobile button min-height and enforcing a 1:1 aspect ratio.
- **Mobile pan and zoom** — Canvas navigation now uses pointer events: one finger to pan, two fingers to pinch zoom (toolbar +/− still works as a fallback).

### Improved

- **Obsidian Sync** — Pending edits flush when the editor closes so changes reach disk before switching devices. Remote file updates reload automatically when there are no unsaved local edits. Help documents the Obsidian Sync settings required for `.bowtie` files.

---

## [1.0.2] — 2026-06-19

### Fixed

- **Obsidian plugin review** — Removed redundant settings tab heading and typed manifest version import to satisfy community plugin lint checks.

### Improved

- **Development** — Added local `eslint-plugin-obsidianmd` setup with `npm run lint`.

---

## [1.0.1] — 2026-06-18

### Fixed

- **Lane add (+) button placement** — Buttons on threat and consequence connectors now sit on the same bezier curve as the diagram edges, so they no longer float above nodes or overlap barrier labels.
- **Layering** — Lane add controls render behind node boxes when paths cross, so a `+` from another row no longer covers mitigation or prevention text.
- **Overlap guard** — Lane add buttons are skipped when they would sit on top of an unrelated node (for example, a direct top-event path crossing another row’s barrier column).

### Improved

- **Symmetric connectors** — Threat and consequence lanes both use the same placement logic, so `+` icons appear consistently on curved and straight segments.
- **PNG export** — Export rendering aligned with on-screen diagram styling.

---

## [1.0.0] — 2026-06-12

Initial public release.

- Interactive risk bowtie diagram editor for Obsidian
- Threats, prevention barriers, top event, mitigation barriers, consequences, and hazard
- Escalation factors, escalation barriers, and per-barrier analysis stacks
- Pan/zoom, undo/redo, inspector panel, PNG export, and auto-save to `.bowtie` files
