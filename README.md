# O-Tie

Build and edit **risk bowtie diagrams** in Obsidian with an interactive visual editor.

## What is O-Tie?

O-Tie is an Obsidian plugin for **bowtie risk analysis** — a visual method used in process safety, operations, and HSE work to show how a hazard can lead to a top event (loss of control), which threats can cause it, which consequences may follow, and which barriers prevent or reduce harm.

Instead of drawing bowties in a separate tool, you create and maintain them as `.bowtie` files inside your vault. O-Tie provides a dedicated editor with pan/zoom, barrier stacks, escalation factors, undo/redo, and PNG export. Changes auto-save as you edit.

## Features

- Interactive bowtie editor with fan-in/fan-out layout
- Threats, prevention barriers, top event, mitigation barriers, consequences, and hazard
- Escalation factors and escalation barriers
- Per-barrier analysis stacks (type, effectiveness, criticality, and custom rows)
- Toolbar: add elements, undo/redo, fit, zoom, PNG export, help
- Inspector panel for label, notes, and delete
- Pan and zoom on the canvas
- Auto-save to `.bowtie` files

## Bowtie structure

```
Threats → Prevention Barriers → Top Event → Mitigation Barriers → Consequences
                                      ↑
                                   Hazard
```

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins**.
2. Turn off **Restricted mode** if needed.
3. Click **Browse**, search for **O-Tie**, and install.
4. Enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Andre482/O-tie/releases).
2. Copy them into `<vault>/.obsidian/plugins/o-tie/`.
3. Reload Obsidian and enable **O-Tie** under **Settings → Community plugins**.

## Usage

1. Click the **bowtie** ribbon icon or run **O-Tie: Create new bowtie**.
2. Enter a name — a `.bowtie` file opens in the editor.
3. Edit on the diagram:
   - **Toolbar**: add threat, consequence, or barrier; fit; zoom; export; help
   - **Double-click** a node or title to rename
   - **Click** a node to inspect it in the bottom panel
   - **Right-click** for context menus
   - **Hover** nodes for quick add/delete buttons
   - **Drag** empty canvas space to pan; **scroll** to zoom
   - **Delete** removes the selected node
   - **Ctrl+Z** / **Ctrl+Y** for undo and redo
4. Changes save automatically.

## Settings

Open **Settings → O-Tie** to configure:

- Default folder for new bowties
- Column gap, row gap, node width, and node height

## Commands

| Command | Description |
|---------|-------------|
| Create new bowtie | Create a new `.bowtie` file |
| Open bowtie file | Open the active `.bowtie` file in the editor |
| Export bowtie as image | Export the diagram as PNG |

## File format

`.bowtie` files are JSON. Example:

```json
{
  "name": "Defective Steamcracker",
  "hazard": "High pressure ethylene",
  "topEvent": "Loss of containment",
  "threats": [{ "label": "Corrosion", "preventionBarriers": [] }],
  "consequences": [{ "label": "Fire", "mitigationBarriers": [] }],
  "view": { "zoom": 1, "panX": 0, "panY": 0 }
}
```

See [examples/steamcracker.bowtie](examples/steamcracker.bowtie).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

**Latest (1.0.1):** Fixes lane add (`+`) button placement on curved connectors, improves layering so buttons stay behind nodes, and aligns threat/consequence lane controls.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

### Releasing

Obsidian expects the GitHub release tag to **match `manifest.json` exactly** (e.g. `1.0.1`, not `v1.0.1`).

```bash
npm version patch          # updates package.json, manifest.json, versions.json
git push origin main --tags
```

Pushing a semver tag (e.g. `1.0.1`) triggers the GitHub Actions release workflow.

To deploy a local build into a vault:

```bash
# Unix / macOS / Git Bash
OBSIDIAN_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/o-tie" npm run deploy
```

```powershell
# Windows PowerShell
$env:OBSIDIAN_VAULT_PATH = "C:\path\to\vault"
.\deploy.ps1
```

## Third-party licenses

This plugin bundles [html-to-image](https://github.com/bubkoo/html-to-image) (MIT) for PNG export.

## License

MIT — see [LICENSE](LICENSE).
