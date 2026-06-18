import { App, Modal } from "obsidian";
import * as manifest from "../manifest.json";

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
			text: `Version ${manifest.version}`,
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
			"Escalation factors (purple, dashed) — branch downward from a barrier when something could weaken that barrier",
			"Escalation barriers (purple, dashed) — sit on escalation factors and control those weakening influences",
		]);

		this.addSection(body, "Barriers", [
			"A barrier is a control that stops or reduces risk along the main bowtie path. In O-Tie, barriers are green nodes on the connectors between threats/consequences and the top event.",
			"Prevention barriers sit between a threat and the top event. They stop the threat from causing the top event — for example an alarm, an interlock, a procedure, or operator training.",
			"Mitigation barriers sit between the top event and a consequence. They limit harm if the top event happens — for example emergency shutdown, fire suppression, or evacuation.",
			"Add prevention barriers from a selected threat (+ Prevention Barrier in the inspector, the lane + button, or the barrier + on the threat node). Add mitigation barriers from a selected consequence the same way, or use + Barrier in the toolbar when a threat or consequence is selected.",
			"Each barrier can carry an analysis stack (type, effectiveness, criticality, and more) — see Barrier analysis stacks below.",
		]);

		this.addSection(body, "Escalation factors and escalation barriers", [
			"Barriers are not always reliable on their own. An escalation factor describes a condition that could weaken, bypass, or defeat a barrier — such as missed maintenance, fatigue, corrosion, or conflicting procedures.",
			"In the diagram, escalation factors appear as purple dashed nodes branching below their parent barrier. Dashed connectors show that this is a secondary path: the factor does not replace the main threat-to-event or event-to-consequence flow, but explains how the barrier might fail.",
			"An escalation barrier is a control targeted at the escalation factor itself — the measure that keeps the weakening influence in check. For example, if an escalation factor is “sensor not calibrated”, an escalation barrier might be “annual calibration program”.",
			"To add an escalation factor, select a prevention or mitigation barrier, then click + Escalation factor in the inspector, the ⚡ button on the barrier, or use the context menu. To add an escalation barrier, select the escalation factor and use + Escalation barrier, the + button on the factor, or the context menu.",
			"Name each node to match your risk assessment. Use notes in the inspector for evidence, assumptions, or actions. A complete bowtie often chains several barriers, each with its own escalation factors and escalation barriers where relevant.",
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
