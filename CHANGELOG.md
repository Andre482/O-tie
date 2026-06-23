# Changelog

All notable changes to O-Tie are documented here.

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
