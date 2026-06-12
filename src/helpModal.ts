import { App, Modal } from "obsidian";

const PLUGIN_VERSION = "1.0.0";

export class HelpModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("o-tie-modal", "o-tie-help-modal");
		contentEl.createEl("h2", { text: "O-Tie Help" });

		contentEl.createEl("p", {
			cls: "o-tie-help-version",
			text: `Version ${PLUGIN_VERSION}`,
		});

		const body = contentEl.createDiv({ cls: "o-tie-help-body" });

		this.addSection(body, "About O-Tie", [
			"O-Tie is an Obsidian plugin for building risk bowtie diagrams with an interactive visual editor.",
			"Diagrams are stored as .bowtie JSON files in your vault and auto-save as you edit.",
		]);

		this.addSection(body, "Getting started", [
			"Click the ribbon icon or run O-Tie: Create new bowtie from the command palette.",
			"Enter a name — a .bowtie file is created and opens in the editor.",
			"Open any existing .bowtie file from your vault to continue editing.",
			"All changes save automatically to the file.",
		]);

		body.createEl("h3", { text: "Bowtie structure" });
		body.createEl("pre", {
			cls: "o-tie-help-diagram",
			text: [
				"Threats → Prevention Barriers → Top Event → Mitigation Barriers → Consequences",
				"                                      ↑",
				"                                   Hazard",
			].join("\n"),
		});
		this.addList(body, [
			"Hazard (gold) — the source of risk, shown above the top event",
			"Top Event (red) — the central loss-of-control event",
			"Threats (gray) — left side; prevention barriers (green) sit on connectors to the top event",
			"Consequences (purple) — right side; mitigation barriers (green) sit on connectors from the top event",
			"Escalation factors (purple) — branch from barriers; can have escalation barriers",
		]);

		this.addSection(body, "Editing", [
			"Use the toolbar to add threats, consequences, and barriers.",
			"Double-click any node or the diagram title to rename inline.",
			"Click a node to select it — the inspector bar at the bottom shows label, notes, and actions.",
			"Right-click nodes or the canvas for a context menu.",
			"Hover nodes for quick buttons: add barrier, add escalation, or delete.",
			"Press Delete to remove the selected node.",
			"Use the + buttons in lanes between threats/consequences and the top event to add barriers quickly.",
		]);

		this.addSection(body, "Barriers and escalation", [
			"Prevention barriers block threats from reaching the top event.",
			"Mitigation barriers reduce consequences after the top event.",
			"Select a barrier, then use + Barrier or the context menu to add escalation factors.",
			"Escalation factors can have their own escalation barriers.",
		]);

		this.addSection(body, "Barrier analysis stacks", [
			"Each barrier can have an expandable stack of analysis rows.",
			"Preset fields include barrier type, effectiveness, criticality, responsible party, validation method, and status.",
			"Add custom rows with editable labels and colors.",
			"Click stack rows to change preset values; expand or collapse the stack with the header toggle.",
		]);

		this.addSection(body, "Navigation", [
			"Drag empty canvas space to pan.",
			"Scroll the mouse wheel to zoom (hold Ctrl for finer control).",
			"Use Fit to center and scale the diagram to the visible area.",
			"Collapse the toolbar with the chevron button; click the floating button on the canvas to show it again.",
		]);

		this.addSection(body, "Undo and redo", [
			"Use the ← and → toolbar buttons, or Ctrl+Z to undo and Ctrl+Y (or Ctrl+Shift+Z) to redo.",
		]);

		this.addSection(body, "Export", [
			"Click the download icon in the toolbar, or right-click the canvas and choose Export as image.",
			"Exports a high-resolution PNG with options for full diagram or visible area, zoom level, grid, and expanded barrier stacks.",
		]);

		this.addSection(body, "Settings", [
			"Open Settings → O-Tie to configure the default folder for new bowties and layout spacing (column gap, row gap, node width, node height).",
		]);

		const actions = contentEl.createDiv({ cls: "o-tie-actions" });
		const closeBtn = actions.createEl("button", { text: "Close", cls: "mod-cta" });
		closeBtn.addEventListener("click", () => this.close());
	}

	private addSection(parent: HTMLElement, title: string, paragraphs: string[]): void {
		parent.createEl("h3", { text: title });
		for (const text of paragraphs) {
			parent.createEl("p", { text });
		}
	}

	private addList(parent: HTMLElement, items: string[]): void {
		const ul = parent.createEl("ul");
		for (const text of items) {
			ul.createEl("li", { text });
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
