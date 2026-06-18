import { Menu, Notice, TextFileView, WorkspaceLeaf, setIcon } from "obsidian";
import { ExportImageModal } from "./exportImageModal";
import { HelpModal } from "./helpModal";
import type { BowtieExportViewport } from "./exportImage";
import { PLUGIN_ICON } from "./icons";
import type OTiePlugin from "./main";
import {
	barrierHeaderHeightFor,
	DEFAULT_LAYOUT,
	layoutBowtie,
	type EdgePath,
	type LayoutConfig,
	type PositionedNode,
	bezierPointAt,
	connectionPorts,
} from "./layout";
import {
	BARRIER_STACK_FIELDS,
	type Barrier,
	type BarrierStackItem,
	type Bowtie,
	BOWTIE_VIEW_TYPE,
	createBarrier,
	createBarrierStackItem,
	cloneBowtie,
	createBowtie,
	createConsequence,
	createEscalationFactor,
	createThreat,
	deserializeBowtie,
	type EscalationFactor,
	nodeRefKey,
	type NodeRef,
	serializeBowtie,
	sortBarrierStack,
	touchBowtie,
} from "./model";

const STACK_ROW_COLOR_OPTIONS: { color: string; label: string }[] = [
	{ color: "#5dade2", label: "Sky blue" },
	{ color: "#3498db", label: "Blue" },
	{ color: "#48c9b0", label: "Teal" },
	{ color: "#1abc9c", label: "Mint" },
	{ color: "#7f8c8d", label: "Gray" },
	{ color: "#1e8449", label: "Dark green" },
	{ color: "#27ae60", label: "Green" },
	{ color: "#f1c40f", label: "Yellow" },
	{ color: "#e67e22", label: "Orange" },
	{ color: "#c0392b", label: "Red" },
	{ color: "#2c3e50", label: "Navy" },
	{ color: "#566573", label: "Slate" },
	{ color: "#ffffff", label: "White" },
	{ color: "#f4ecf7", label: "Light purple" },
	{ color: "#eafaf1", label: "Light green" },
];

const LIGHT_STACK_ROW_COLORS = new Set(["#ffffff", "#f4ecf7", "#eafaf1"]);

function isLightStackColor(color: string): boolean {
	if (LIGHT_STACK_ROW_COLORS.has(color)) return true;
	const match = /^#([0-9a-f]{6})$/i.exec(color);
	if (!match) return false;
	const n = parseInt(match[1], 16);
	const r = (n >> 16) & 0xff;
	const g = (n >> 8) & 0xff;
	const b = n & 0xff;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.62;
}

function createColorMenuTitle(color: string, label: string): DocumentFragment {
	const frag = activeDocument.createDocumentFragment();
	const wrap = frag.createEl("span", { cls: "o-tie-color-menu-title" });
	const swatch = wrap.createEl("span", { cls: "o-tie-color-swatch" });
	swatch.setCssStyles({ backgroundColor: color });
	if (LIGHT_STACK_ROW_COLORS.has(color)) {
		swatch.addClass("o-tie-color-swatch-light");
	}
	wrap.createEl("span", { cls: "o-tie-color-menu-label", text: label });
	return frag;
}

export { BOWTIE_VIEW_TYPE };

export class BowtieView extends TextFileView {
	bowtie: Bowtie;
	plugin: OTiePlugin;
	private selectedRef: NodeRef | null = null;
	private containerEl_: HTMLElement;
	private viewportEl: HTMLElement;
	private stageEl: HTMLElement;
	private transformEl: HTMLElement;
	private svgEl: SVGSVGElement;
	private nodesEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private inspectorEl: HTMLElement;
	private isPanning = false;
	private panStart = { x: 0, y: 0 };
	private panOrigin = { x: 0, y: 0 };
	private saveTimeout: number | null = null;
	private viewSaveTimeout: number | null = null;
	private viewShellReady = false;
	private panZoomReady = false;
	private wheelRaf: number | null = null;
	private wheelDeltaAccum = 0;
	private wheelClient = { x: 0, y: 0 };
	private wheelCtrlKey = false;
	private toolbarTitleEl: HTMLElement | null = null;
	private toolbarActionsEl: HTMLElement | null = null;
	private toolbarToggleEl: HTMLButtonElement | null = null;
	private toolbarRevealEl: HTMLButtonElement | null = null;
	private toolbarCollapsed = false;
	private undoBtn: HTMLButtonElement | null = null;
	private redoBtn: HTMLButtonElement | null = null;
	private undoStack: Bowtie[] = [];
	private redoStack: Bowtie[] = [];
	private undoSelectionStack: (NodeRef | null)[] = [];
	private redoSelectionStack: (NodeRef | null)[] = [];
	private isRestoringHistory = false;
	private static readonly MAX_UNDO = 50;
	private static readonly GRID_SIZE = 20;
	private stackCollapseBackup: Map<string, boolean> | null = null;
	private static readonly useCssZoom =
		typeof CSS !== "undefined" && CSS.supports("zoom", "1");

	constructor(leaf: WorkspaceLeaf, plugin: OTiePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.bowtie = createBowtie("Untitled");
	}

	getViewType(): string {
		return BOWTIE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.bowtie.name || "Bowtie";
	}

	getIcon(): string {
		return PLUGIN_ICON;
	}

	getViewData(): string {
		return serializeBowtie(this.bowtie);
	}

	setViewData(data: string, clear: boolean): void {
		if (clear) this.clear();
		try {
			this.bowtie = deserializeBowtie(data);
		} catch {
			this.bowtie = createBowtie("Untitled");
		}
		this.resetHistory();
		this.render();
	}

	clear(): void {
		this.contentEl.empty();
		this.viewShellReady = false;
		this.panZoomReady = false;
		this.toolbarTitleEl = null;
		this.undoBtn = null;
		this.redoBtn = null;
		this.resetHistory();
	}

	private getLayoutConfig(): LayoutConfig {
		const s = this.plugin.settings;
		return {
			...DEFAULT_LAYOUT,
			columnGap: s.columnGap,
			rowGap: s.rowGap,
			nodeWidth: s.nodeWidth,
			nodeHeight: s.nodeHeight,
		};
	}

	private scheduleSave(): void {
		if (this.saveTimeout !== null) window.clearTimeout(this.saveTimeout);
		this.saveTimeout = window.setTimeout(() => {
			this.bowtie = touchBowtie(this.bowtie);
			this.requestSave();
		}, 400);
	}

	private resetHistory(): void {
		this.undoStack = [];
		this.redoStack = [];
		this.undoSelectionStack = [];
		this.redoSelectionStack = [];
		this.updateUndoRedoButtons();
	}

	private commitEdit(): void {
		if (this.isRestoringHistory) return;
		this.undoStack.push(cloneBowtie(this.bowtie));
		this.undoSelectionStack.push(this.selectedRef ? { ...this.selectedRef } : null);
		if (this.undoStack.length > BowtieView.MAX_UNDO) {
			this.undoStack.shift();
			this.undoSelectionStack.shift();
		}
		this.redoStack = [];
		this.redoSelectionStack = [];
		this.updateUndoRedoButtons();
	}

	private updateUndoRedoButtons(): void {
		if (this.undoBtn) this.undoBtn.disabled = this.undoStack.length === 0;
		if (this.redoBtn) this.redoBtn.disabled = this.redoStack.length === 0;
	}

	private nodeRefExists(ref: NodeRef): boolean {
		switch (ref.kind) {
			case "hazard":
			case "topEvent":
				return true;
			case "threat":
				return this.bowtie.threats.some((t) => t.id === ref.threatId);
			case "consequence":
				return this.bowtie.consequences.some((c) => c.id === ref.consequenceId);
			case "preventionBarrier":
			case "mitigationBarrier":
				return this.findBarrier(ref) !== null;
			case "escalationFactor":
				return this.findEscalationFactor(ref) !== null;
			case "escalationBarrier": {
				const factor = this.findEscalationFactor(ref);
				return factor?.escalationBarriers.some((eb) => eb.id === ref.escalationBarrierId) ?? false;
			}
		}
	}

	private restoreHistorySnapshot(snapshot: Bowtie, selectedRef: NodeRef | null): void {
		this.isRestoringHistory = true;
		this.bowtie = snapshot;
		this.selectedRef = selectedRef && this.nodeRefExists(selectedRef) ? { ...selectedRef } : null;
		this.render();
		this.bowtie = touchBowtie(this.bowtie);
		this.requestSave();
		this.isRestoringHistory = false;
		this.updateUndoRedoButtons();
	}

	private undo(): void {
		if (this.undoStack.length === 0) return;
		this.redoStack.push(cloneBowtie(this.bowtie));
		this.redoSelectionStack.push(this.selectedRef ? { ...this.selectedRef } : null);
		const snapshot = this.undoStack.pop()!;
		const selectedRef = this.undoSelectionStack.pop() ?? null;
		this.restoreHistorySnapshot(snapshot, selectedRef);
	}

	private redo(): void {
		if (this.redoStack.length === 0) return;
		this.undoStack.push(cloneBowtie(this.bowtie));
		this.undoSelectionStack.push(this.selectedRef ? { ...this.selectedRef } : null);
		const snapshot = this.redoStack.pop()!;
		const selectedRef = this.redoSelectionStack.pop() ?? null;
		this.restoreHistorySnapshot(snapshot, selectedRef);
	}

	private render(): void {
		this.ensureViewShell();
		this.updateToolbarTitle();
		this.renderDiagram();
		this.renderInspector();
	}

	private ensureViewShell(): void {
		if (this.viewShellReady) return;

		this.contentEl.empty();
		this.contentEl.addClass("o-tie-view-root");

		this.toolbarEl = this.contentEl.createDiv({ cls: "o-tie-toolbar" });
		this.renderToolbar();

		this.containerEl_ = this.contentEl.createDiv({ cls: "o-tie-canvas-container" });
		this.toolbarRevealEl = this.containerEl_.createEl("button", {
			cls: "o-tie-toolbar-btn o-tie-toolbar-btn-icon o-tie-toolbar-reveal",
		});
		this.toolbarRevealEl.setAttribute("aria-label", "Show toolbar");
		this.toolbarRevealEl.addEventListener("mousedown", (e) => e.stopPropagation());
		this.toolbarRevealEl.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.toolbarCollapsed) this.toggleToolbarCollapsed();
		});

		this.viewportEl = this.containerEl_.createDiv({ cls: "o-tie-viewport" });
		this.stageEl = this.viewportEl.createDiv({ cls: "o-tie-stage" });

		this.transformEl = this.stageEl.createDiv({ cls: "o-tie-transform" });
		const ns = "http://www.w3.org/2000/svg";
		this.svgEl = activeDocument.createElementNS(ns, "svg");
		this.svgEl.classList.add("o-tie-svg");
		this.transformEl.appendChild(this.svgEl);

		this.nodesEl = this.transformEl.createDiv({ cls: "o-tie-nodes" });

		this.inspectorEl = this.contentEl.createDiv({ cls: "o-tie-inspector" });

		this.setupPanZoom();
		this.viewShellReady = true;
	}

	private updateToolbarTitle(): void {
		this.toolbarTitleEl?.setText(this.bowtie.name);
	}

	private renderToolbar(): void {
		this.toolbarEl.empty();

		const brand = this.toolbarEl.createDiv({ cls: "o-tie-toolbar-brand" });
		this.toolbarTitleEl = brand.createSpan({
			cls: "o-tie-toolbar-title",
			text: this.bowtie.name,
		});
		this.toolbarTitleEl.addEventListener("dblclick", () =>
			this.startInlineEdit(this.toolbarTitleEl!, this.bowtie.name, (v) => {
				this.bowtie.name = v;
				this.toolbarTitleEl!.setText(v);
				this.scheduleSave();
			})
		);

		this.toolbarActionsEl = this.toolbarEl.createDiv({ cls: "o-tie-toolbar-actions" });

		const historyGroup = this.toolbarActionsEl.createDiv({ cls: "o-tie-toolbar-group" });
		this.undoBtn = this.createToolbarBtn(historyGroup, "←", () => this.undo(), {
			icon: true,
			title: "Undo",
		});
		this.redoBtn = this.createToolbarBtn(historyGroup, "→", () => this.redo(), {
			icon: true,
			title: "Redo",
		});
		this.toolbarActionsEl.createDiv({ cls: "o-tie-toolbar-separator" });

		const addGroup = this.toolbarActionsEl.createDiv({ cls: "o-tie-toolbar-group" });
		this.createToolbarBtn(addGroup, "+ Threat", () => this.addThreat(), { primary: true });
		this.createToolbarBtn(addGroup, "+ Consequence", () => this.addConsequence(), { primary: true });
		this.createToolbarBtn(addGroup, "+ Barrier", () => this.addBarrierToSelection());

		this.toolbarActionsEl.createDiv({ cls: "o-tie-toolbar-separator" });

		const viewGroup = this.toolbarActionsEl.createDiv({ cls: "o-tie-toolbar-group" });
		this.createToolbarBtn(viewGroup, "Fit", () => this.fitToView(), { title: "Fit diagram to view" });
		this.createToolbarBtn(viewGroup, "−", () => this.adjustZoom(1 / 1.15), {
			icon: true,
			title: "Zoom out",
		});
		this.createToolbarBtn(viewGroup, "+", () => this.adjustZoom(1.15), {
			icon: true,
			title: "Zoom in",
		});
		this.createToolbarIconBtn(viewGroup, "download", () => this.openExportImageModal(), {
			title: "Export as image",
		});

		const toolbarEnd = this.toolbarEl.createDiv({ cls: "o-tie-toolbar-end" });
		this.createToolbarIconBtn(toolbarEnd, "circle-help", () => this.openHelpModal(), {
			title: "Help",
		});
		this.toolbarToggleEl = toolbarEnd.createEl("button", {
			cls: "o-tie-toolbar-btn o-tie-toolbar-btn-icon o-tie-toolbar-toggle",
		});
		this.toolbarToggleEl.addEventListener("click", () => this.toggleToolbarCollapsed());
		this.updateToolbarCollapsedUi();
		this.updateUndoRedoButtons();
	}

	private toggleToolbarCollapsed(): void {
		this.toolbarCollapsed = !this.toolbarCollapsed;
		this.updateToolbarCollapsedUi();
	}

	private updateToolbarCollapsedUi(): void {
		this.contentEl?.toggleClass("o-tie-toolbar-is-collapsed", this.toolbarCollapsed);
		this.toolbarToggleEl?.setAttribute(
			"aria-label",
			this.toolbarCollapsed ? "Show toolbar" : "Hide toolbar"
		);
	}

	private createToolbarBtn(
		parent: HTMLElement,
		label: string,
		action: () => void,
		opts: { primary?: boolean; icon?: boolean; title?: string } = {}
	): HTMLButtonElement {
		const cls = ["o-tie-toolbar-btn"];
		if (opts.primary) cls.push("o-tie-toolbar-btn-primary");
		if (opts.icon) cls.push("o-tie-toolbar-btn-icon");
		const btn = parent.createEl("button", { cls: cls.join(" "), text: label });
		btn.setAttribute("aria-label", opts.title ?? label);
		btn.addEventListener("click", action);
		return btn;
	}

	private createToolbarIconBtn(
		parent: HTMLElement,
		icon: string,
		action: () => void,
		opts: { title: string }
	): HTMLButtonElement {
		const btn = parent.createEl("button", {
			cls: "o-tie-toolbar-btn o-tie-toolbar-btn-icon",
		});
		btn.setAttribute("aria-label", opts.title);
		btn.setAttribute("title", opts.title);
		setIcon(btn, icon);
		btn.addEventListener("click", action);
		return btn;
	}

	private renderInspector(): void {
		this.inspectorEl.empty();
		if (!this.selectedRef) {
			const empty = this.inspectorEl.createDiv({ cls: "o-tie-inspector-empty" });
			empty.setText("Click a node to inspect and edit its properties");
			return;
		}

		const label = this.getNodeLabel(this.selectedRef);
		const subtitle = this.getNodeSubtitle(this.selectedRef);

		const row = this.inspectorEl.createDiv({ cls: "o-tie-inspector-row" });
		row.createSpan({
			cls: `o-tie-inspector-kind o-tie-inspector-kind-${this.selectedRef.kind}`,
			text: subtitle,
		});

		const fields = row.createDiv({ cls: "o-tie-inspector-fields" });
		const input = fields.createEl("input", {
			type: "text",
			cls: "o-tie-inspector-input",
		});
		input.value = label;
		input.placeholder = "Label";
		input.addEventListener("change", () => {
			if (input.value === label) return;
			this.commitEdit();
			this.setNodeLabel(this.selectedRef!, input.value);
			this.render();
			this.scheduleSave();
		});

		const notes = this.getNodeNotes(this.selectedRef);
		const notesArea = fields.createEl("textarea", {
			cls: "o-tie-inspector-notes",
			placeholder: "Notes",
			attr: { rows: "2" },
		});
		notesArea.value = notes;
		window.requestAnimationFrame(() => this.fitInspectorNotesArea(notesArea));
		notesArea.addEventListener("input", () => this.fitInspectorNotesArea(notesArea));
		notesArea.addEventListener("change", () => {
			if (notesArea.value === notes) return;
			this.commitEdit();
			this.setNodeNotes(this.selectedRef!, notesArea.value);
			this.scheduleSave();
		});

		const actions = row.createDiv({ cls: "o-tie-inspector-actions" });

		if (this.selectedRef.kind === "preventionBarrier" || this.selectedRef.kind === "mitigationBarrier") {
			const stackBtn = actions.createEl("button", { text: "+ Stack row", cls: "mod-small" });
			stackBtn.addEventListener("click", (e) => {
				const rect = stackBtn.getBoundingClientRect();
				this.showAddStackRowMenu(
					{ clientX: rect.left, clientY: rect.bottom } as MouseEvent,
					this.selectedRef!
				);
			});
			const escBtn = actions.createEl("button", { text: "+ Escalation factor", cls: "mod-small" });
			escBtn.addEventListener("click", () => {
				this.addEscalationFactor(this.selectedRef!);
			});
		}

		if (this.selectedRef.kind === "escalationFactor") {
			const escBarBtn = actions.createEl("button", {
				text: "+ Escalation barrier",
				cls: "mod-small",
			});
			escBarBtn.addEventListener("click", () => {
				this.addEscalationBarrier(this.selectedRef!);
			});
		}

		if (this.selectedRef.kind === "threat") {
			const barBtn = actions.createEl("button", { text: "+ Prevention Barrier", cls: "mod-cta mod-small" });
			barBtn.addEventListener("click", () => {
				this.addPreventionBarrier(this.selectedRef!.threatId!);
			});
		}

		if (this.selectedRef.kind === "consequence") {
			const barBtn = actions.createEl("button", { text: "+ Mitigation Barrier", cls: "mod-cta mod-small" });
			barBtn.addEventListener("click", () => {
				this.addMitigationBarrier(this.selectedRef!.consequenceId!);
			});
		}

		const delBtn = actions.createEl("button", { text: "Delete", cls: "mod-warning mod-small" });
		delBtn.addEventListener("click", () => {
			this.deleteNode(this.selectedRef!);
		});
	}

	private fitInspectorNotesArea(textarea: HTMLTextAreaElement): void {
		textarea.addClass("o-tie-inspector-notes-resize");
		textarea.setCssStyles({ height: `${textarea.scrollHeight}px` });
		textarea.removeClass("o-tie-inspector-notes-resize");
	}

	private renderDiagram(): void {
		const layout = layoutBowtie(this.bowtie, this.getLayoutConfig());

		this.transformEl.setCssStyles({
			width: `${layout.bounds.width}px`,
			height: `${layout.bounds.height}px`,
		});
		this.svgEl.setAttribute("width", String(layout.bounds.width));
		this.svgEl.setAttribute("height", String(layout.bounds.height));
		this.svgEl.innerHTML = "";

		for (const edge of layout.edges) {
			const path = activeDocument.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", edge.path);
			path.setAttribute("class", `o-tie-edge o-tie-edge-${edge.kind}`);
			this.svgEl.appendChild(path);
			this.renderEdgeArrow(edge);
		}

		this.nodesEl.empty();
		this.renderLaneAddButtons(layout);
		for (const node of layout.nodes) {
			this.renderNode(node);
		}

		this.applyTransform();

		if (!this.bowtie.view || (this.bowtie.view.panX === 0 && this.bowtie.view.panY === 0 && this.bowtie.view.zoom === 1)) {
			window.setTimeout(() => this.fitToView(false), 0);
		}
	}

	private renderEdgeArrow(edge: EdgePath): void {
		const ns = "http://www.w3.org/2000/svg";
		const { x, y, angleDeg } = edge.arrow;
		const size = 8;

		const group = activeDocument.createElementNS(ns, "g");
		group.setAttribute("class", `o-tie-edge-arrow o-tie-edge-arrow-${edge.kind}`);
		group.setAttribute("transform", `translate(${x} ${y}) rotate(${angleDeg})`);

		const head = activeDocument.createElementNS(ns, "path");
		head.setAttribute("d", `M0 0 L-${size} ${-size * 0.42} L-${size} ${size * 0.42} Z`);
		group.appendChild(head);
		this.svgEl.appendChild(group);
	}

	private renderNode(node: PositionedNode): void {
		const wrap = this.nodesEl.createDiv({
			cls: `o-tie-node-wrap o-tie-node-wrap-${node.kind}`,
			attr: { "data-ref": nodeRefKey(node.ref) },
		});
		wrap.setCssStyles({
			left: `${node.x}px`,
			top: `${node.y}px`,
			width: `${node.width}px`,
			height: `${node.height}px`,
		});

		if (this.selectedRef && nodeRefKey(this.selectedRef) === nodeRefKey(node.ref)) {
			wrap.addClass("o-tie-node-selected");
		}

		const el = wrap.createDiv({ cls: `o-tie-node o-tie-node-${node.kind}` });

		const isBarrier =
			node.kind === "preventionBarrier" || node.kind === "mitigationBarrier";
		let labelEl: HTMLElement;

		if (isBarrier) {
			labelEl = this.renderBarrierContent(wrap, el, node);
		} else if (node.kind === "topEvent") {
			wrap.createDiv({ cls: "o-tie-top-event-badge", text: node.subtitle });
			labelEl = el.createDiv({
				cls: "o-tie-node-label o-tie-top-event-label",
				text: node.label,
			});
		} else {
			const stripe = el.createDiv({ cls: "o-tie-node-stripe" });
			stripe.setText(node.subtitle);
			labelEl = el.createDiv({ cls: "o-tie-node-label", text: node.label });
		}

		const deleteBtn = wrap.createEl("button", { cls: "o-tie-node-delete o-tie-close-btn" });
		deleteBtn.setAttribute("aria-label", "Delete");
		deleteBtn.addEventListener("mousedown", (e) => e.stopPropagation());
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.deleteNode(node.ref);
		});

		if (node.kind === "threat" || node.kind === "consequence") {
			const addBar = wrap.createEl("button", { cls: "o-tie-node-add-barrier o-tie-plus-btn" });
			addBar.setAttribute("aria-label", "Add barrier");
			addBar.addEventListener("mousedown", (e) => e.stopPropagation());
			addBar.addEventListener("click", (e) => {
				e.stopPropagation();
				if (node.kind === "threat" && node.ref.threatId) {
					this.addPreventionBarrier(node.ref.threatId);
				} else if (node.kind === "consequence" && node.ref.consequenceId) {
					this.addMitigationBarrier(node.ref.consequenceId);
				}
			});
		}

		if (isBarrier) {
			const addEsc = wrap.createEl("button", { cls: "o-tie-node-add-escalation", text: "⚡" });
			addEsc.setAttribute("aria-label", "Add escalation factor");
			addEsc.addEventListener("mousedown", (e) => e.stopPropagation());
			addEsc.addEventListener("click", (e) => {
				e.stopPropagation();
				this.addEscalationFactor(node.ref);
			});
		}

		if (node.kind === "escalationFactor") {
			const addEscBar = wrap.createEl("button", {
				cls: "o-tie-node-add-esc-barrier o-tie-plus-btn",
			});
			addEscBar.setAttribute("aria-label", "Add escalation barrier");
			addEscBar.addEventListener("mousedown", (e) => e.stopPropagation());
			addEscBar.addEventListener("click", (e) => {
				e.stopPropagation();
				this.addEscalationBarrier(node.ref);
			});
		}

		wrap.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest("button")) return;
			e.stopPropagation();
			this.selectedRef = node.ref;
			this.renderInspector();
			this.nodesEl.querySelectorAll(".o-tie-node-wrap").forEach((n) => n.removeClass("o-tie-node-selected"));
			wrap.addClass("o-tie-node-selected");
		});

		if (!isBarrier) {
			el.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				this.startInlineEdit(labelEl, node.label, (v) => {
					this.setNodeLabel(node.ref, v);
					this.render();
					this.scheduleSave();
				});
			});
		}

		wrap.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showContextMenu(e, node.ref);
		});
	}

	private renderBarrierContent(
		wrap: HTMLElement,
		el: HTMLElement,
		node: PositionedNode
	): HTMLElement {
		const barrier = this.findBarrier(node.ref);
		const layout = this.getLayoutConfig();
		const stack = barrier?.stack ?? [];
		const collapsed = barrier?.stackCollapsed ?? true;

		const headerH = barrier
			? barrierHeaderHeightFor(barrier, layout)
			: layout.barrierHeaderHeight;

		const header = el.createDiv({ cls: "o-tie-barrier-header" });
		header.setCssStyles({
			height: `${headerH}px`,
			minHeight: `${headerH}px`,
		});

		const stripe = header.createDiv({ cls: "o-tie-node-stripe" });
		stripe.setText(node.subtitle);

		const headerBody = header.createDiv({ cls: "o-tie-barrier-header-body" });
		const labelEl = headerBody.createDiv({ cls: "o-tie-node-label", text: node.label });
		labelEl.addEventListener("dblclick", (e) => {
			e.stopPropagation();
			this.startInlineEdit(labelEl, node.label, (v) => {
				this.setNodeLabel(node.ref, v);
				this.render();
				this.scheduleSave();
			});
		});

		const addStack = wrap.createEl("button", {
			cls: "o-tie-stack-add o-tie-plus-btn",
		});
		addStack.setAttribute("aria-label", "Add stack row");
		addStack.addEventListener("mousedown", (e) => e.stopPropagation());
		addStack.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showAddStackRowMenu(e, node.ref);
		});

		if (stack.length > 0) {
			const chevron = wrap.createEl("button", {
				cls: `o-tie-stack-chevron${collapsed ? " is-collapsed" : ""}`,
			});
			chevron.setCssStyles({ top: `${headerH}px` });
			chevron.setAttribute("aria-label", collapsed ? "Expand stack" : "Collapse stack");
			chevron.addEventListener("mousedown", (e) => e.stopPropagation());
			chevron.addEventListener("click", (e) => {
				e.stopPropagation();
				this.toggleBarrierStackCollapsed(node.ref);
			});
		}

		if (!collapsed) {
			const stackEl = el.createDiv({ cls: "o-tie-barrier-stack" });
			if (stack.length === 0) {
				const placeholder = stackEl.createDiv({ cls: "o-tie-stack-empty" });
				placeholder.setText("Click + to add analysis row");
				placeholder.setCssStyles({ height: `${layout.barrierStackRowHeight}px` });
				placeholder.addEventListener("click", (e) => {
					e.stopPropagation();
					this.showAddStackRowMenu(e, node.ref);
				});
			} else {
				for (const item of stack) {
					this.renderStackRow(stackEl, node.ref, item, layout);
				}
			}
		}

		if (collapsed) {
			wrap.addClass("o-tie-barrier-stack-collapsed");
		}

		return labelEl;
	}

	private renderStackRow(
		stackEl: HTMLElement,
		ref: NodeRef,
		item: BarrierStackItem,
		layout: import("./layout").LayoutConfig
	): void {
		const row = stackEl.createDiv({
			cls: "o-tie-stack-row",
			attr: { "data-stack-id": item.id },
		});
		const rowStyles: Partial<CSSStyleDeclaration> = {
			height: `${layout.barrierStackRowHeight}px`,
		};
		if (item.color) {
			rowStyles.backgroundColor = item.color;
			if (isLightStackColor(item.color)) {
				row.addClass("o-tie-stack-row-light");
			}
		}
		row.setCssStyles(rowStyles);

		const fieldDef = item.field
			? BARRIER_STACK_FIELDS.find((f) => f.key === item.field)
			: undefined;
		if (fieldDef) {
			row.addClass("o-tie-stack-row-preset");
		}

		const labelEl = row.createDiv({ cls: "o-tie-stack-row-label", text: item.label });
		if (fieldDef) {
			row.setAttribute("aria-label", `Click to change ${fieldDef.name}`);
			row.addClass("o-tie-stack-row-clickable");
			row.addEventListener("click", (e) => {
				e.stopPropagation();
				this.showChangeStackRowMenu(e, ref, item.id);
			});
		} else {
			labelEl.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				this.startInlineEdit(labelEl, item.label, (v) => {
					this.updateStackRowLabel(ref, item.id, v);
				});
			});
		}

		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showStackRowContextMenu(e, ref, item.id);
		});
	}

	private toggleBarrierStackCollapsed(ref: NodeRef): void {
		const barrier = this.findBarrier(ref);
		if (!barrier) return;
		this.commitEdit();
		barrier.stackCollapsed = !(barrier.stackCollapsed ?? false);
		this.render();
		this.scheduleSave();
	}

	private barrierStackHasField(barrier: Barrier, fieldKey: string): boolean {
		return (barrier.stack ?? []).some((item) => item.field === fieldKey);
	}

	private showAddStackRowMenu(event: MouseEvent, ref: NodeRef): void {
		const barrier = this.findBarrier(ref);
		if (!barrier) return;

		const menu = new Menu();
		let hasPresetOptions = false;
		for (const field of BARRIER_STACK_FIELDS) {
			if (this.barrierStackHasField(barrier, field.key)) continue;
			hasPresetOptions = true;
			menu.addItem((item) => item.setTitle(field.name).setIsLabel(true));
			for (const option of field.options) {
				menu.addItem((item) =>
					item.setTitle(option.label).onClick(() => {
						this.addStackRow(ref, field.key, option.label, option.color);
					})
				);
			}
			menu.addSeparator();
		}
		if (!hasPresetOptions) {
			menu.addItem((item) =>
				item.setTitle("All standard fields are already on this barrier").setIsLabel(true)
			);
			menu.addSeparator();
		}
		menu.addItem((item) =>
			item.setTitle("Custom row").setIcon("plus").onClick(() => {
				this.addStackRow(ref);
			})
		);
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	private showChangeStackRowMenu(event: MouseEvent, ref: NodeRef, itemId: string): void {
		const barrier = this.findBarrier(ref);
		const stackItem = barrier?.stack?.find((s) => s.id === itemId);
		if (!stackItem?.field) return;

		const fieldDef = BARRIER_STACK_FIELDS.find((f) => f.key === stackItem.field);
		if (!fieldDef) return;

		const menu = new Menu();
		menu.addItem((item) => item.setTitle(fieldDef.name).setIsLabel(true));
		for (const option of fieldDef.options) {
			menu.addItem((item) =>
				item
					.setTitle(option.label)
					.setChecked(option.label === stackItem.label)
					.onClick(() => {
						this.setStackRowOption(ref, itemId, option.label, option.color);
					})
			);
		}
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	private addStackRow(
		ref: NodeRef,
		field?: string,
		label = "New row",
		color?: string
	): void {
		const barrier = this.findBarrier(ref);
		if (!barrier) return;
		if (field && this.barrierStackHasField(barrier, field)) {
			const fieldName = BARRIER_STACK_FIELDS.find((f) => f.key === field)?.name ?? field;
			new Notice(`${fieldName} is already on this barrier. Click the row to change it.`);
			return;
		}
		this.commitEdit();
		if (!barrier.stack) barrier.stack = [];
		const item = createBarrierStackItem(label, field, color);
		barrier.stack.push(item);
		sortBarrierStack(barrier.stack);
		barrier.stackCollapsed = false;
		this.render();
		this.scheduleSave();

		if (!field) {
			window.setTimeout(() => {
				const rowEl = this.nodesEl.querySelector<HTMLElement>(
					`[data-ref="${nodeRefKey(ref)}"] [data-stack-id="${item.id}"] .o-tie-stack-row-label`
				);
				if (rowEl) {
					this.startInlineEdit(rowEl, label, (v) => {
						this.updateStackRowLabel(ref, item.id, v);
					});
				}
			}, 0);
		}
	}

	private setStackRowOption(
		ref: NodeRef,
		itemId: string,
		label: string,
		color: string
	): void {
		const barrier = this.findBarrier(ref);
		const item = barrier?.stack?.find((s) => s.id === itemId);
		if (!item) return;
		this.commitEdit();
		item.label = label;
		item.color = color;
		this.render();
		this.scheduleSave();
	}

	private updateStackRowLabel(ref: NodeRef, itemId: string, label: string): void {
		const barrier = this.findBarrier(ref);
		const item = barrier?.stack?.find((s) => s.id === itemId);
		if (!item || item.field) return;
		item.label = label.trim() || item.label;
		this.render();
		this.scheduleSave();
	}

	private updateStackRowColor(ref: NodeRef, itemId: string, color: string): void {
		const barrier = this.findBarrier(ref);
		const item = barrier?.stack?.find((s) => s.id === itemId);
		if (!item || item.color === color) return;
		this.commitEdit();
		item.color = color;
		this.render();
		this.scheduleSave();
	}

	private deleteStackRow(ref: NodeRef, itemId: string): void {
		const barrier = this.findBarrier(ref);
		if (!barrier?.stack) return;
		this.commitEdit();
		barrier.stack = barrier.stack.filter((s) => s.id !== itemId);
		this.render();
		this.scheduleSave();
	}

	private showStackRowContextMenu(event: MouseEvent, ref: NodeRef, itemId: string): void {
		const barrier = this.findBarrier(ref);
		const stackItem = barrier?.stack?.find((s) => s.id === itemId);
		if (!stackItem) return;

		const menu = new Menu();
		if (stackItem.field) {
			menu.addItem((item) =>
				item
					.setTitle("Change value")
					.setIcon("pencil")
					.onClick(() => this.showChangeStackRowMenu(event, ref, itemId))
			);
		} else {
			menu.addItem((item) =>
				item.setTitle("Edit label").setIcon("pencil").onClick(() => {
					const rowEl = this.nodesEl.querySelector<HTMLElement>(
						`[data-ref="${nodeRefKey(ref)}"] [data-stack-id="${itemId}"] .o-tie-stack-row-label`
					);
					if (rowEl) {
						this.startInlineEdit(rowEl, stackItem.label, (v) => {
							this.updateStackRowLabel(ref, itemId, v);
						});
					}
				})
			);
			menu.addItem((item) => item.setTitle("Change color").setIsLabel(true));
			for (const option of STACK_ROW_COLOR_OPTIONS) {
				menu.addItem((item) =>
					item
						.setTitle(createColorMenuTitle(option.color, option.label))
						.setChecked(stackItem.color === option.color)
						.onClick(() => {
							this.updateStackRowColor(ref, itemId, option.color);
						})
				);
			}
			menu.addSeparator();
		}

		menu.addItem((item) =>
			item.setTitle("Delete row").setIcon("trash").onClick(() => {
				this.deleteStackRow(ref, itemId);
			})
		);
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	private showContextMenu(event: MouseEvent, ref: NodeRef): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("Rename").setIcon("pencil").onClick(() => {
				const label = this.getNodeLabel(ref);
				const nodeEl = this.nodesEl.querySelector(
					`[data-ref="${nodeRefKey(ref)}"] .o-tie-node-label`
				) as HTMLElement;
				if (nodeEl) {
					this.startInlineEdit(nodeEl, label, (v) => {
						this.setNodeLabel(ref, v);
						this.render();
						this.scheduleSave();
					});
				}
			})
		);
		menu.addItem((item) =>
			item.setTitle("Delete").setIcon("trash").onClick(() => this.deleteNode(ref))
		);
		if (ref.kind === "threat" && ref.threatId) {
			menu.addItem((item) =>
				item
					.setTitle("Add prevention barrier")
					.setIcon("shield")
					.onClick(() => this.addPreventionBarrier(ref.threatId!))
			);
		}
		if (ref.kind === "consequence" && ref.consequenceId) {
			menu.addItem((item) =>
				item
					.setTitle("Add mitigation barrier")
					.setIcon("shield")
					.onClick(() => this.addMitigationBarrier(ref.consequenceId!))
			);
		}
		if (ref.kind === "preventionBarrier" || ref.kind === "mitigationBarrier") {
			menu.addItem((item) =>
				item
					.setTitle("Add stack row")
					.setIcon("layers")
					.onClick(() => this.showAddStackRowMenu(event, ref))
			);
			menu.addItem((item) =>
				item.setTitle("Add escalation factor").setIcon("zap").onClick(() => this.addEscalationFactor(ref))
			);
		}
		if (ref.kind === "escalationFactor") {
			menu.addItem((item) =>
				item
					.setTitle("Add escalation barrier")
					.setIcon("shield")
					.onClick(() => this.addEscalationBarrier(ref))
			);
		}
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	private startInlineEdit(
		el: HTMLElement,
		initial: string,
		onCommit: (value: string) => void
	): void {
		const input = activeDocument.createElement("input");
		input.type = "text";
		input.className = "o-tie-inline-edit";
		input.value = initial;
		el.empty();
		el.appendChild(input);
		input.focus();
		input.select();

		const commit = () => {
			const v = input.value.trim();
			if (v && v !== initial) {
				this.commitEdit();
				onCommit(v);
			} else {
				el.setText(initial);
			}
		};

		input.addEventListener("blur", commit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commit();
			}
			if (e.key === "Escape") {
				el.setText(initial);
			}
		});
	}

	private setupPanZoom(): void {
		if (this.panZoomReady) return;
		this.panZoomReady = true;

		this.registerDomEvent(this.containerEl_, "contextmenu", (e) => {
			const target = e.target as HTMLElement;
			if (target.closest(".o-tie-node-wrap") || target.closest(".o-tie-lane-add")) {
				return;
			}
			e.preventDefault();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle("Export as image")
					.setIcon("download")
					.onClick(() => this.openExportImageModal())
			);
			menu.showAtMouseEvent(e);
		});

		this.registerDomEvent(this.containerEl_, "mousedown", (e) => {
			const target = e.target as HTMLElement;
			if (
				target.closest(".o-tie-node-wrap") ||
				target.closest(".o-tie-lane-add") ||
				target.closest("button")
			) {
				return;
			}
			this.isPanning = true;
			this.panStart = { x: e.clientX, y: e.clientY };
			this.panOrigin = {
				x: this.bowtie.view?.panX ?? 0,
				y: this.bowtie.view?.panY ?? 0,
			};
			this.containerEl_.addClass("o-tie-panning");
		});

		this.registerDomEvent(window, "mousemove", (e) => {
			if (!this.isPanning) return;
			const dx = e.clientX - this.panStart.x;
			const dy = e.clientY - this.panStart.y;
			if (!this.bowtie.view) this.bowtie.view = { zoom: 1, panX: 0, panY: 0 };
			this.bowtie.view.panX = this.panOrigin.x + dx;
			this.bowtie.view.panY = this.panOrigin.y + dy;
			this.applyTransform();
		});

		this.registerDomEvent(window, "mouseup", () => {
			if (this.isPanning) {
				this.isPanning = false;
				this.containerEl_.removeClass("o-tie-panning");
				this.scheduleViewSave();
			}
		});

		this.registerDomEvent(
			this.containerEl_,
			"wheel",
			(e) => {
				e.preventDefault();
				this.wheelDeltaAccum += this.normalizeWheelDelta(e);
				this.wheelClient = { x: e.clientX, y: e.clientY };
				this.wheelCtrlKey = e.ctrlKey;
				if (this.wheelRaf !== null) return;
				this.wheelRaf = window.requestAnimationFrame(() => {
					this.wheelRaf = null;
					const dy = this.wheelDeltaAccum;
					this.wheelDeltaAccum = 0;
					if (Math.abs(dy) < 0.01) return;
					const factor = this.wheelFactorFromDelta(dy, this.wheelCtrlKey);
					this.zoomAt(this.wheelClient.x, this.wheelClient.y, factor);
				});
			},
			{ passive: false }
		);

		this.registerDomEvent(this.containerEl_, "click", (e) => {
			if ((e.target as HTMLElement).closest(".o-tie-node-wrap")) return;
			this.selectedRef = null;
			this.renderInspector();
			this.nodesEl.querySelectorAll(".o-tie-node-wrap").forEach((n) => n.removeClass("o-tie-node-selected"));
		});

		this.registerDomEvent(activeDocument, "keydown", (e) => {
			if (this.app.workspace.getActiveViewOfType(BowtieView) !== this) return;
			const target = e.target as HTMLElement;
			if (target.closest("input, textarea, [contenteditable='true']")) return;

			const mod = e.ctrlKey || e.metaKey;
			if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
				e.preventDefault();
				this.undo();
				return;
			}
			if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
				e.preventDefault();
				this.redo();
				return;
			}
			if (e.key === "Delete" && this.selectedRef) {
				e.preventDefault();
				this.deleteNode(this.selectedRef);
			}
		});

		const resizeObserver = new ResizeObserver(() => {
			this.applyTransform();
		});
		resizeObserver.observe(this.containerEl_);
		this.register(() => resizeObserver.disconnect());
	}

	private normalizeWheelDelta(e: WheelEvent): number {
		let dy = e.deltaY;
		if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
			dy *= 16;
		} else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
			dy *= this.containerEl_.clientHeight || window.innerHeight;
		}
		return dy;
	}

	private wheelFactorFromDelta(deltaY: number, ctrlKey: boolean): number {
		// Gentler zoom: ~5% per mouse-wheel notch, smooth trackpad pinch.
		const sensitivity = ctrlKey ? 0.0012 : 0.00045;
		const factor = Math.exp(-deltaY * sensitivity);
		const maxStep = ctrlKey ? 1.08 : 1.06;
		const minStep = 1 / maxStep;
		return Math.max(minStep, Math.min(maxStep, factor));
	}

	private applyTransform(): void {
		if (!this.viewportEl || !this.stageEl) return;
		const view = this.bowtie.view ?? { zoom: 1, panX: 0, panY: 0 };
		const { panX, panY, zoom } = view;

		// Pan and zoom on separate layers so zoom anchors correctly under the cursor.
		this.viewportEl.setCssStyles({
			transform: `translate3d(${panX}px, ${panY}px, 0)`,
			transformOrigin: "0 0",
		});

		if (BowtieView.useCssZoom) {
			this.stageEl.setCssStyles({ zoom: String(zoom), transform: "" });
		} else {
			this.stageEl.setCssStyles({
				zoom: "1",
				transform: `scale(${zoom})`,
				transformOrigin: "0 0",
			});
		}

		if (this.containerEl_) {
			const gs = BowtieView.GRID_SIZE;
			const bgX = ((panX % gs) + gs) % gs;
			const bgY = ((panY % gs) + gs) % gs;
			this.containerEl_.setCssStyles({ backgroundPosition: `${bgX}px ${bgY}px` });
		}
	}

	private scheduleViewSave(): void {
		if (this.viewSaveTimeout !== null) window.clearTimeout(this.viewSaveTimeout);
		this.viewSaveTimeout = window.setTimeout(() => {
			this.scheduleSave();
		}, 500);
	}

	private zoomAt(clientX: number, clientY: number, factor: number): void {
		if (!this.bowtie.view) this.bowtie.view = { zoom: 1, panX: 0, panY: 0 };
		const rect = this.containerEl_.getBoundingClientRect();
		const mx = clientX - rect.left;
		const my = clientY - rect.top;
		const oldZoom = this.bowtie.view.zoom;
		const newZoom = Math.min(3, Math.max(0.2, oldZoom * factor));
		if (newZoom === oldZoom) return;

		const worldX = (mx - this.bowtie.view.panX) / oldZoom;
		const worldY = (my - this.bowtie.view.panY) / oldZoom;
		this.bowtie.view.zoom = newZoom;
		this.bowtie.view.panX = mx - worldX * newZoom;
		this.bowtie.view.panY = my - worldY * newZoom;
		this.applyTransform();
		this.scheduleViewSave();
	}

	private adjustZoom(factor: number): void {
		const rect = this.containerEl_.getBoundingClientRect();
		this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
	}

	openHelpModal(): void {
		new HelpModal(this.app).open();
	}

	openExportImageModal(): void {
		this.ensureViewShell();
		const layout = layoutBowtie(this.bowtie, this.getLayoutConfig());
		new ExportImageModal(this.app, {
			svgEl: this.svgEl,
			nodesEl: this.nodesEl,
			viewRootEl: this.contentEl,
			bounds: layout.bounds,
			viewport: this.getExportViewport(layout.bounds),
			bowtieName: this.bowtie.name,
			onExpandStacks: async () => {
				this.expandAllStacksForExport();
			},
			onRestoreStacks: () => {
				this.restoreStackCollapseAfterExport();
			},
		}).open();
	}

	private getExportViewport(bounds: {
		width: number;
		height: number;
	}): BowtieExportViewport {
		const view = this.bowtie.view ?? { zoom: 1, panX: 0, panY: 0 };
		const rect = this.containerEl_.getBoundingClientRect();
		const x = Math.max(0, -view.panX / view.zoom);
		const y = Math.max(0, -view.panY / view.zoom);
		const width = Math.min(rect.width / view.zoom, Math.max(1, bounds.width - x));
		const height = Math.min(rect.height / view.zoom, Math.max(1, bounds.height - y));
		return { x, y, width, height };
	}

	private forEachBarrier(callback: (barrier: Barrier) => void): void {
		for (const threat of this.bowtie.threats) {
			for (const barrier of threat.preventionBarriers) {
				callback(barrier);
			}
		}
		for (const consequence of this.bowtie.consequences) {
			for (const barrier of consequence.mitigationBarriers) {
				callback(barrier);
				for (const factor of barrier.escalationFactors) {
					for (const escBarrier of factor.escalationBarriers) {
						callback(escBarrier);
					}
				}
			}
		}
	}

	private expandAllStacksForExport(): void {
		this.stackCollapseBackup = new Map();
		this.forEachBarrier((barrier) => {
			this.stackCollapseBackup!.set(barrier.id, barrier.stackCollapsed ?? true);
			barrier.stackCollapsed = false;
		});
		this.renderDiagram();
	}

	private restoreStackCollapseAfterExport(): void {
		if (!this.stackCollapseBackup) return;
		this.forEachBarrier((barrier) => {
			const saved = this.stackCollapseBackup!.get(barrier.id);
			if (saved !== undefined) {
				barrier.stackCollapsed = saved;
			}
		});
		this.stackCollapseBackup = null;
		this.renderDiagram();
	}

	private fitToView(animate = true): void {
		const layout = layoutBowtie(this.bowtie, this.getLayoutConfig());
		const rect = this.containerEl_.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;

		const padding = 40;
		const scaleX = (rect.width - padding * 2) / layout.bounds.width;
		const scaleY = (rect.height - padding * 2) / layout.bounds.height;
		const zoom = Math.min(1.2, Math.max(0.3, Math.min(scaleX, scaleY)));

		const panX = (rect.width - layout.bounds.width * zoom) / 2;
		const panY = (rect.height - layout.bounds.height * zoom) / 2;

		if (!this.bowtie.view) this.bowtie.view = { zoom: 1, panX: 0, panY: 0 };
		this.bowtie.view.zoom = zoom;
		this.bowtie.view.panX = panX;
		this.bowtie.view.panY = panY;
		this.applyTransform();
		if (animate) this.scheduleViewSave();
	}

	private addThreat(): void {
		this.commitEdit();
		this.bowtie.threats.push(createThreat("New threat"));
		this.render();
		this.scheduleSave();
	}

	private addConsequence(): void {
		this.commitEdit();
		this.bowtie.consequences.push(createConsequence("New consequence"));
		this.render();
		this.scheduleSave();
	}

	private addBarrierToSelection(): void {
		if (this.selectedRef?.kind === "threat" && this.selectedRef.threatId) {
			this.addPreventionBarrier(this.selectedRef.threatId);
			return;
		}
		if (this.selectedRef?.kind === "consequence" && this.selectedRef.consequenceId) {
			this.addMitigationBarrier(this.selectedRef.consequenceId);
			return;
		}
		if (this.bowtie.threats.length > 0) {
			this.addPreventionBarrier(this.bowtie.threats[0].id);
			return;
		}
		if (this.bowtie.consequences.length > 0) {
			this.addMitigationBarrier(this.bowtie.consequences[0].id);
			return;
		}
		new Notice("Add a threat or consequence first, then add barriers.");
	}

	private addPreventionBarrier(threatId: string): void {
		const threat = this.bowtie.threats.find((t) => t.id === threatId);
		if (!threat) return;
		this.commitEdit();
		threat.preventionBarriers.push(createBarrier("New barrier"));
		this.selectedRef = { kind: "threat", threatId };
		this.render();
		this.scheduleSave();
		new Notice("Prevention barrier added.");
	}

	private addMitigationBarrier(consequenceId: string): void {
		const cons = this.bowtie.consequences.find((c) => c.id === consequenceId);
		if (!cons) return;
		this.commitEdit();
		cons.mitigationBarriers.push(createBarrier("New barrier"));
		this.selectedRef = { kind: "consequence", consequenceId };
		this.render();
		this.scheduleSave();
		new Notice("Mitigation barrier added.");
	}

	private renderLaneAddButtons(layout: import("./layout").LayoutResult): void {
		const topEvent = layout.nodes.find((n) => n.kind === "topEvent");
		if (!topEvent) return;

		for (const threat of this.bowtie.threats) {
			const threatNode = layout.nodes.find(
				(n) => n.kind === "threat" && n.ref.threatId === threat.id
			);
			if (!threatNode) continue;

			const lastBarrier = this.findLastBarrierInLane(
				layout,
				(n) => n.kind === "preventionBarrier" && n.ref.threatId === threat.id
			);
			const fromNode = lastBarrier ?? threatNode;
			const pos = this.laneAddPosition(fromNode, topEvent, layout);
			if (!pos) continue;

			this.createLaneAddButton(pos.x, pos.y, "Add prevention barrier", () =>
				this.addPreventionBarrier(threat.id)
			);
		}

		for (const consequence of this.bowtie.consequences) {
			const consNode = layout.nodes.find(
				(n) => n.kind === "consequence" && n.ref.consequenceId === consequence.id
			);
			if (!consNode) continue;

			const lastMitigation = this.findLastBarrierInLane(
				layout,
				(n) =>
					n.kind === "mitigationBarrier" &&
					n.ref.consequenceId === consequence.id
			);

			const fromNode = lastMitigation ?? topEvent;
			const pos = this.laneAddPosition(fromNode, consNode, layout);
			if (!pos) continue;

			this.createLaneAddButton(pos.x, pos.y, "Add mitigation barrier", () =>
				this.addMitigationBarrier(consequence.id)
			);
		}
	}

	private findLastBarrierInLane(
		layout: import("./layout").LayoutResult,
		match: (node: PositionedNode) => boolean
	): PositionedNode | undefined {
		return layout.nodes.filter(match).sort((a, b) => a.x - b.x).pop();
	}

	private laneAddPosition(
		from: PositionedNode,
		to: PositionedNode,
		layout: import("./layout").LayoutResult
	): { x: number; y: number } | null {
		const LANE_ADD_SIZE = 26;
		const LANE_ADD_HALF = 13;
		const MIN_GAP = LANE_ADD_SIZE + 4;

		const ports = connectionPorts(from, to);
		const gap = ports.to.x - ports.from.x;
		if (gap < MIN_GAP) return null;

		const point = bezierPointAt(ports.from.x, ports.from.y, ports.to.x, ports.to.y, 0.5);
		const cx = point.x;
		const cy = point.y;

		for (const node of layout.nodes) {
			if (node === from || node === to) continue;
			if (this.laneAddOverlapsButton(cx, cy, LANE_ADD_HALF, node)) {
				return null;
			}
		}

		return { x: cx - LANE_ADD_HALF, y: cy - LANE_ADD_HALF };
	}

	private laneAddOverlapsButton(
		cx: number,
		cy: number,
		half: number,
		node: PositionedNode
	): boolean {
		const margin = 2;
		const left = cx - half;
		const right = cx + half;
		const top = cy - half;
		const bottom = cy + half;
		return (
			right > node.x + margin &&
			left < node.x + node.width - margin &&
			bottom > node.y + margin &&
			top < node.y + node.height - margin
		);
	}

	private createLaneAddButton(
		x: number,
		y: number,
		label: string,
		onClick: () => void
	): void {
		const btn = this.nodesEl.createEl("button", { cls: "o-tie-lane-add o-tie-plus-btn" });
		btn.setCssStyles({ left: `${x}px`, top: `${y}px` });
		btn.setAttribute("aria-label", label);
		btn.addEventListener("mousedown", (e) => e.stopPropagation());
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			onClick();
		});
	}

	private addEscalationFactor(ref: NodeRef): void {
		const barrier = this.findBarrier(ref);
		if (!barrier) return;
		this.commitEdit();
		barrier.escalationFactors.push(createEscalationFactor("Escalation factor"));
		this.render();
		this.scheduleSave();
	}

	private addEscalationBarrier(ref: NodeRef): void {
		const factor = this.findEscalationFactor(ref);
		if (!factor) return;
		this.commitEdit();
		factor.escalationBarriers.push(createBarrier("Escalation barrier"));
		this.render();
		this.scheduleSave();
	}

	private findEscalationFactor(ref: NodeRef): EscalationFactor | null {
		if (!ref.escalationId) return null;
		const barrier = this.findBarrier(ref);
		return barrier?.escalationFactors.find((f) => f.id === ref.escalationId) ?? null;
	}

	private findBarrier(ref: NodeRef): Barrier | null {
		if (ref.threatId && ref.barrierId) {
			const threat = this.bowtie.threats.find((t) => t.id === ref.threatId);
			return threat?.preventionBarriers.find((b) => b.id === ref.barrierId) ?? null;
		}
		if (ref.consequenceId && ref.barrierId) {
			const cons = this.bowtie.consequences.find((c) => c.id === ref.consequenceId);
			return cons?.mitigationBarriers.find((b) => b.id === ref.barrierId) ?? null;
		}
		return null;
	}

	private getNodeLabel(ref: NodeRef): string {
		switch (ref.kind) {
			case "hazard":
				return this.bowtie.hazard;
			case "topEvent":
				return this.bowtie.topEvent;
			case "threat": {
				const t = this.bowtie.threats.find((x) => x.id === ref.threatId);
				return t?.label ?? "";
			}
			case "consequence": {
				const c = this.bowtie.consequences.find((x) => x.id === ref.consequenceId);
				return c?.label ?? "";
			}
			case "preventionBarrier":
			case "mitigationBarrier": {
				const b = this.findBarrier(ref);
				return b?.label ?? "";
			}
			case "escalationFactor": {
				const b = this.findBarrier(ref);
				const f = b?.escalationFactors.find((x) => x.id === ref.escalationId);
				return f?.label ?? "";
			}
			case "escalationBarrier": {
				const b = this.findBarrier(ref);
				const f = b?.escalationFactors.find((x) => x.id === ref.escalationId);
				const escB = f?.escalationBarriers.find((x) => x.id === ref.escalationBarrierId);
				return escB?.label ?? "";
			}
		}
	}

	private getNodeSubtitle(ref: NodeRef): string {
		const map: Record<string, string> = {
			hazard: "Hazard",
			topEvent: "Top Event",
			threat: "Threat",
			consequence: "Consequence",
			preventionBarrier: "Prevention Barrier",
			mitigationBarrier: "Mitigation Barrier",
			escalationFactor: "Escalation Factor",
			escalationBarrier: "Escalation Barrier",
		};
		return map[ref.kind] ?? ref.kind;
	}

	private getNodeNotes(ref: NodeRef): string {
		switch (ref.kind) {
			case "threat": {
				const t = this.bowtie.threats.find((x) => x.id === ref.threatId);
				return t?.notes ?? "";
			}
			case "consequence": {
				const c = this.bowtie.consequences.find((x) => x.id === ref.consequenceId);
				return c?.notes ?? "";
			}
			case "preventionBarrier":
			case "mitigationBarrier": {
				const b = this.findBarrier(ref);
				return b?.notes ?? "";
			}
			case "escalationFactor": {
				const b = this.findBarrier(ref);
				const f = b?.escalationFactors.find((x) => x.id === ref.escalationId);
				return f?.notes ?? "";
			}
		}
		return "";
	}

	private setNodeLabel(ref: NodeRef, label: string): void {
		switch (ref.kind) {
			case "hazard":
				this.bowtie.hazard = label;
				break;
			case "topEvent":
				this.bowtie.topEvent = label;
				break;
			case "threat": {
				const t = this.bowtie.threats.find((x) => x.id === ref.threatId);
				if (t) t.label = label;
				break;
			}
			case "consequence": {
				const c = this.bowtie.consequences.find((x) => x.id === ref.consequenceId);
				if (c) c.label = label;
				break;
			}
			case "preventionBarrier":
			case "mitigationBarrier": {
				const b = this.findBarrier(ref);
				if (b) b.label = label;
				break;
			}
			case "escalationFactor": {
				const b = this.findBarrier(ref);
				const f = b?.escalationFactors.find((x) => x.id === ref.escalationId);
				if (f) f.label = label;
				break;
			}
			case "escalationBarrier": {
				const b = this.findBarrier(ref);
				const f = b?.escalationFactors.find((x) => x.id === ref.escalationId);
				const escB = f?.escalationBarriers.find((x) => x.id === ref.escalationBarrierId);
				if (escB) escB.label = label;
				break;
			}
		}
	}

	private setNodeNotes(ref: NodeRef, notes: string): void {
		switch (ref.kind) {
			case "threat": {
				const t = this.bowtie.threats.find((x) => x.id === ref.threatId);
				if (t) t.notes = notes;
				break;
			}
			case "consequence": {
				const c = this.bowtie.consequences.find((x) => x.id === ref.consequenceId);
				if (c) c.notes = notes;
				break;
			}
			case "preventionBarrier":
			case "mitigationBarrier": {
				const b = this.findBarrier(ref);
				if (b) b.notes = notes;
				break;
			}
			case "escalationFactor": {
				const b = this.findBarrier(ref);
				const f = b?.escalationFactors.find((x) => x.id === ref.escalationId);
				if (f) f.notes = notes;
				break;
			}
		}
	}

	private deleteNode(ref: NodeRef): void {
		this.commitEdit();
		switch (ref.kind) {
			case "hazard":
				this.bowtie.hazard = "";
				break;
			case "topEvent":
				this.bowtie.topEvent = "";
				break;
			case "threat":
				this.bowtie.threats = this.bowtie.threats.filter((t) => t.id !== ref.threatId);
				break;
			case "consequence":
				this.bowtie.consequences = this.bowtie.consequences.filter((c) => c.id !== ref.consequenceId);
				break;
			case "preventionBarrier": {
				const threat = this.bowtie.threats.find((t) => t.id === ref.threatId);
				if (threat) {
					threat.preventionBarriers = threat.preventionBarriers.filter((b) => b.id !== ref.barrierId);
				}
				break;
			}
			case "mitigationBarrier": {
				const cons = this.bowtie.consequences.find((c) => c.id === ref.consequenceId);
				if (cons) {
					cons.mitigationBarriers = cons.mitigationBarriers.filter((b) => b.id !== ref.barrierId);
				}
				break;
			}
			case "escalationFactor": {
				const b = this.findBarrier(ref);
				if (b) {
					b.escalationFactors = b.escalationFactors.filter((f) => f.id !== ref.escalationId);
				}
				break;
			}
			case "escalationBarrier": {
				const b = this.findBarrier(ref);
				const f = b?.escalationFactors.find((x) => x.id === ref.escalationId);
				if (f) {
					f.escalationBarriers = f.escalationBarriers.filter(
						(eb) => eb.id !== ref.escalationBarrierId
					);
				}
				break;
			}
		}
		this.selectedRef = null;
		this.render();
		this.scheduleSave();
		new Notice("Deleted.");
	}
}
