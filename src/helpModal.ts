import { App, Modal } from "obsidian";
import * as manifestData from "../manifest.json";

const PLUGIN_VERSION = (manifestData as { version: string }).version;

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
				"Threats → Prevention Barriers → Event 1 → Barriers → Event 2 → … → Mitigation Barriers → Consequences",
				"                         ↑ Hazard    ↑ Hazard",
			].join("\n"),
		});
		this.addList(body, [
			"Hazard (gold) — the source of risk, shown above each top event",
			"Top Event (red) — one or more loss-of-control events chained left to right in the center",
			"Barriers between events — green controls in the lanes connecting consecutive top events",
			"Threats (gray) — far left; prevention barriers (green) sit on connectors to the first top event",
			"Consequences (purple) — far right; mitigation barriers (green) sit on connectors from the last top event",
			"Safeguards (slate blue) — branch downward from a barrier; add as many as needed before each degradation factor",
			"Degradation factors (warm bronze) — one per ⚡ click; multiple appear in parallel columns below the barrier",
		]);

		this.addSection(body, "Barriers", [
			"A barrier is a control that stops or reduces risk along the main bowtie path. In O-Tie, barriers are green nodes on the connectors between threats/consequences and top events, or between consecutive top events.",
			"Prevention barriers sit between a threat and the first top event. They stop the threat from causing the top event — for example an alarm, an interlock, a procedure, or operator training.",
			"Barriers between events sit in the lanes connecting one top event to the next. They represent controls that prevent escalation from one loss-of-control state to the next.",
			"Mitigation barriers sit between the last top event and a consequence. They limit harm if the top event happens — for example emergency shutdown, fire suppression, or evacuation.",
			"Add prevention barriers from a selected threat (+ Prevention Barrier in the inspector, the lane + button, or the barrier + on the threat node). Add barriers between events from a selected top event (except the last) or via the lane + button between events. Add mitigation barriers from a selected consequence the same way, or use + Barrier in the toolbar when a relevant node is selected.",
			"Each barrier can carry an analysis stack (type, effectiveness, criticality, and more) — see Barrier analysis stacks below.",
		]);

		this.addSection(body, "Safeguards and degradation factors", [
			"Barriers are not always reliable on their own. Safeguards are controls that branch downward from a barrier — for example training, inspections, or backup systems. You can add as many safeguards as needed.",
			"The degradation factor is always the last node in the chain below a barrier and describes the ultimate weakening influence if safeguards fail.",
			"To add a degradation factor, select a barrier and click the ⚡ button, or use the inspector or context menu. To add safeguards before it, select the degradation factor and use the + button.",
			"Name each node to match your risk assessment. Use notes in the inspector for evidence, assumptions, or actions.",
		]);

		this.addSection(body, "Editing", [
			"Use the toolbar to add threats, consequences, top events, and barriers.",
			"Double-click any node or the diagram title to rename inline.",
			"Click a node to select it — the inspector bar at the bottom shows label, notes, and actions.",
			"Right-click nodes or the canvas for a context menu.",
			"Hover nodes for quick buttons: add barrier, add safeguard, or delete.",
			"Press Delete to remove the selected node.",
			"Use the + buttons in lanes between nodes to add barriers quickly — including between consecutive top events.",
		]);

		this.addSection(body, "Barrier analysis stacks", [
			"Each barrier can have an expandable stack of analysis rows.",
			"Preset fields include barrier type, effectiveness, criticality, responsible party, validation method, and status.",
			"Add custom rows with editable labels and colors.",
			"Click stack rows to change preset values; expand or collapse the stack with the header toggle.",
		]);

		this.addSection(body, "Navigation", [
			"Drag empty canvas space to pan.",
			"On phone or tablet: use one finger to pan and two fingers to pinch zoom.",
			"Scroll the mouse wheel to zoom on desktop (hold Ctrl for finer control).",
			"Use the toolbar + and − buttons as a zoom fallback on any device.",
			"Use Fit to center and scale the diagram to the visible area.",
			"Collapse the toolbar with the chevron button; click the floating button on the canvas to show it again.",
		]);

		this.addSection(body, "Syncing across devices", [
			".bowtie files are normal vault files and sync through Obsidian Sync like any other note.",
			"In Settings → Sync → Selective sync, enable Sync all other types on every device. Custom extensions such as .bowtie are not included in the default image/audio/video/PDF set.",
			"Under Vault configuration sync, enable Active community plugin list and Installed community plugins so O-Tie is available on mobile.",
			"After changing sync settings, force-quit and reopen Obsidian on each device.",
			"Confirm each device is connected to the same remote vault and that no folder containing .bowtie files is listed under Excluded folders.",
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
