# Changelog

All notable changes to O-Tie are documented here.

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
