import { Menu, Notice, Platform, TextFileView, WorkspaceLeaf, setIcon } from "obsidian";
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
	createBowtie,
	createConsequence,
	createDegradationChain,
	createEscalationNode,
	createThreat,
	createTopEvent,
	deserializeBowtie,
	type DegradationChain,
	type EscalationNode,
	nodeRefKey,
	type NodeRef,
	serializeBowtie,
	sortBarrierStack,
	touchBowtie,
} from "./model";
import { ExternalSync } from "./externalSync";
import { BowtieHistory } from "./history";
import { computeFit, computeZoomAt, normalizeWheelDelta, wheelFactorFromDelta } from "./panZoom";
import { STACK_ROW_COLOR_OPTIONS, createColorMenuTitle, isLightStackColor } from "./stackRows";

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
	private overlayEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private inspectorEl: HTMLElement;
	private isPanning = false;
	private panStart = { x: 0, y: 0 };
	private panOrigin = { x: 0, y: 0 };
	private panPointerId: number | null = null;
	private activePointers = new Map<number, { x: number; y: number }>();
	private pinchLastDistance: number | null = null;
	private gestureMoved = false;
	private panStartedOnNode = false;
	private suppressNextClick = false;
	private saveTimeout: number | null = null;
	private viewSaveTimeout: number | null = null;
	private viewShellReady = false;
	private panZoomReady = false;
	private externalSyncReady = false;
	private lastSelfSaveAt = 0;
	private static readonly ICON_SIZE = 22;
	private static readonly LANE_ADD_SIZE = 26;
	private static readonly STACK_ADD_SIZE = 20;
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
	private history = new BowtieHistory(BowtieView.MAX_UNDO);
	private isRestoringHistory = false;
	private static readonly MAX_UNDO = 50;
	private static readonly GRID_SIZE = 20;
	private stackCollapseBackup: Map<string, boolean> | null = null;
	private loadError = false;
	private rawData: string | null = null;

	private get useCssZoom(): boolean {
		// CSS zoom distorts border-radius on child buttons in mobile WebKit.
		return (
			typeof CSS !== "undefined" &&
			CSS.supports("zoom", "1") &&
			!this.useOverlayControls
		);
	}

	private get useOverlayControls(): boolean {
		return Platform.isMobileApp;
	}

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
		// Preserve the original bytes of a file we could not parse so autosave
		// never overwrites a malformed (but potentially recoverable) file.
		if (this.loadError && this.rawData !== null) {
			return this.rawData;
		}
		return serializeBowtie(this.bowtie);
	}

	setViewData(data: string, clear: boolean): void {
		if (clear) this.clear();
		try {
			this.bowtie = deserializeBowtie(data);
			this.loadError = false;
			this.rawData = null;
		} catch {
			this.loadError = true;
			this.rawData = data;
			this.bowtie = createBowtie("Untitled");
			new Notice(
				"Could not read this .bowtie file — it may be malformed. The file has not been changed; editing here will overwrite it."
			);
		}
		this.resetHistory();
		this.render();
	}

	clear(): void {
		this.contentEl.empty();
		this.viewShellReady = false;
		this.panZoomReady = false;
		this.externalSyncReady = false;
		this.toolbarTitleEl = null;
		this.undoBtn = null;
		this.redoBtn = null;
		this.loadError = false;
		this.rawData = null;
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
			this.saveTimeout = null;
			this.bowtie = touchBowtie(this.bowtie);
			this.lastSelfSaveAt = Date.now();
			this.requestSave();
		}, 400);
	}

	private flushPendingSave(): void {
		const hadPending =
			this.saveTimeout !== null || this.viewSaveTimeout !== null;
		if (this.viewSaveTimeout !== null) {
			window.clearTimeout(this.viewSaveTimeout);
			this.viewSaveTimeout = null;
		}
		if (this.saveTimeout !== null) {
			window.clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		if (hadPending) {
			this.bowtie = touchBowtie(this.bowtie);
			this.lastSelfSaveAt = Date.now();
			this.requestSave();
		}
	}

	async onClose(): Promise<void> {
		this.flushPendingSave();
	}

	private resetHistory(): void {
		this.history.reset();
		this.updateUndoRedoButtons();
	}

	private commitEdit(): void {
		if (this.isRestoringHistory) return;
		// A deliberate user edit takes ownership of the file; allow saves again.
		this.loadError = false;
		this.rawData = null;
		this.history.record(this.bowtie, this.selectedRef);
		this.updateUndoRedoButtons();
	}

	private updateUndoRedoButtons(): void {
		if (this.undoBtn) this.undoBtn.disabled = !this.history.canUndo;
		if (this.redoBtn) this.redoBtn.disabled = !this.history.canRedo;
	}

	private nodeRefExists(ref: NodeRef): boolean {
		switch (ref.kind) {
			case "hazard":
				return this.bowtie.events.some((e) => e.id === ref.eventId);
			case "topEvent":
				return this.bowtie.events.some((e) => e.id === ref.eventId);
			case "threat":
				return this.bowtie.threats.some((t) => t.id === ref.threatId);
			case "consequence":
				return this.bowtie.consequences.some((c) => c.id === ref.consequenceId);
			case "preventionBarrier":
			case "mitigationBarrier":
			case "transitionBarrier":
				return this.findBarrier(ref) !== null;
			case "safeguard": {
				return this.findSafeguard(ref) !== null;
			}
			case "degradationFactor":
				return this.findDegradationChain(ref) !== null;
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
		const snapshot = this.history.undo(this.bowtie, this.selectedRef);
		if (!snapshot) return;
		this.restoreHistorySnapshot(snapshot.bowtie, snapshot.selection);
	}

	private redo(): void {
		const snapshot = this.history.redo(this.bowtie, this.selectedRef);
		if (!snapshot) return;
		this.restoreHistorySnapshot(snapshot.bowtie, snapshot.selection);
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

		this.overlayEl = this.containerEl_.createDiv({ cls: "o-tie-controls-overlay" });

		this.inspectorEl = this.contentEl.createDiv({ cls: "o-tie-inspector" });

		this.setupPanZoom();
		this.setupExternalSync();
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
		this.createToolbarBtn(addGroup, "+ threat", () => this.addThreat(), { primary: true });
		this.createToolbarBtn(addGroup, "+ consequence", () => this.addConsequence(), { primary: true });
		this.createToolbarBtn(addGroup, "+ event", () => this.addTopEvent(), { primary: true });
		this.createToolbarBtn(addGroup, "+ barrier", () => this.addBarrierToSelection());

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

		if (
			this.selectedRef.kind === "preventionBarrier" ||
			this.selectedRef.kind === "mitigationBarrier" ||
			this.selectedRef.kind === "transitionBarrier"
		) {
			const stackBtn = actions.createEl("button", { text: "+ stack row", cls: "mod-small" });
			stackBtn.addEventListener("click", (e) => {
				const rect = stackBtn.getBoundingClientRect();
				this.showAddStackRowMenu(
					{ clientX: rect.left, clientY: rect.bottom } as MouseEvent,
					this.selectedRef!
				);
			});
			const degBtn = actions.createEl("button", { text: "⚡ Degradation factor", cls: "mod-small" });
			degBtn.addEventListener("click", () => {
				this.addDegradationFactor(this.selectedRef!);
			});
		}

		if (this.selectedRef.kind === "degradationFactor") {
			const sgBtn = actions.createEl("button", { text: "+ safeguard", cls: "mod-small" });
			sgBtn.addEventListener("click", () => {
				this.addSafeguard(this.selectedRef!);
			});
		}

		if (this.selectedRef.kind === "topEvent" && this.selectedRef.eventId) {
			const eventIndex = this.bowtie.events.findIndex((e) => e.id === this.selectedRef!.eventId);
			if (eventIndex >= 0 && eventIndex < this.bowtie.events.length - 1) {
				const barBtn = actions.createEl("button", {
					text: "+ barrier to next event",
					cls: "mod-cta mod-small",
				});
				barBtn.addEventListener("click", () => {
					this.addTransitionBarrier(this.selectedRef!.eventId!);
				});
			}
		}

		if (this.selectedRef.kind === "threat") {
			const barBtn = actions.createEl("button", { text: "+ prevention barrier", cls: "mod-cta mod-small" });
			barBtn.addEventListener("click", () => {
				this.addPreventionBarrier(this.selectedRef!.threatId!);
			});
		}

		if (this.selectedRef.kind === "consequence") {
			const barBtn = actions.createEl("button", { text: "+ mitigation barrier", cls: "mod-cta mod-small" });
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
		this.svgEl.replaceChildren();

		for (const edge of layout.edges) {
			const path = activeDocument.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", edge.path);
			path.setAttribute("class", `o-tie-edge o-tie-edge-${edge.kind}`);
			this.svgEl.appendChild(path);
			this.renderEdgeArrow(edge);
		}

		this.nodesEl.empty();
		if (this.overlayEl) this.overlayEl.empty();
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

	private selectNodeElement(ref: NodeRef, wrap: HTMLElement): void {
		this.selectedRef = ref;
		this.renderInspector();
		this.nodesEl.querySelectorAll(".o-tie-node-wrap").forEach((n) => {
			n.removeClass("o-tie-node-selected");
			n.setAttribute("aria-pressed", "false");
		});
		wrap.addClass("o-tie-node-selected");
		wrap.setAttribute("aria-pressed", "true");
		this.updateOverlayVisibility();
	}

	private clearSelection(): void {
		this.selectedRef = null;
		this.renderInspector();
		this.nodesEl.querySelectorAll(".o-tie-node-wrap").forEach((n) => {
			n.removeClass("o-tie-node-selected");
			n.setAttribute("aria-pressed", "false");
		});
		this.updateOverlayVisibility();
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
			node.kind === "preventionBarrier" ||
			node.kind === "mitigationBarrier" ||
			node.kind === "transitionBarrier";
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

		if (this.useOverlayControls) {
			const deleteCenter = this.nodeControlCenter(node, "top-right");
			this.createOverlayControl(
				"o-tie-node-delete o-tie-close-btn",
				deleteCenter.x,
				deleteCenter.y,
				BowtieView.ICON_SIZE,
				"Delete",
				() => this.deleteNode(node.ref),
				node.ref,
				"selected"
			);

			if (node.kind === "threat" || node.kind === "consequence") {
				const barCenter = this.nodeControlCenter(node, "bottom-right");
				this.createOverlayControl(
					"o-tie-node-add-barrier o-tie-plus-btn",
					barCenter.x,
					barCenter.y,
					BowtieView.ICON_SIZE,
					"Add barrier",
					() => {
						if (node.kind === "threat" && node.ref.threatId) {
							this.addPreventionBarrier(node.ref.threatId);
						} else if (node.kind === "consequence" && node.ref.consequenceId) {
							this.addMitigationBarrier(node.ref.consequenceId);
						}
					},
					node.ref,
					"always"
				);
			}

			if (node.kind === "topEvent" && node.ref.eventId) {
				const eventIndex = this.bowtie.events.findIndex((e) => e.id === node.ref.eventId);
				if (eventIndex >= 0 && eventIndex < this.bowtie.events.length - 1) {
					const barCenter = this.nodeControlCenter(node, "bottom-right");
					this.createOverlayControl(
						"o-tie-node-add-barrier o-tie-plus-btn",
						barCenter.x,
						barCenter.y,
						BowtieView.ICON_SIZE,
						"Add barrier to next event",
						() => this.addTransitionBarrier(node.ref.eventId!),
						node.ref,
						"selected"
					);
				}
			}

			if (isBarrier) {
				const degCenter = this.nodeControlCenter(node, "bottom-left");
				this.createOverlayControl(
					"o-tie-node-add-escalation",
					degCenter.x,
					degCenter.y,
					BowtieView.ICON_SIZE,
					"Add degradation factor",
					() => this.addDegradationFactor(node.ref),
					node.ref,
					"selected",
					"⚡"
				);
			}

			if (node.kind === "degradationFactor") {
				const sgCenter = this.nodeControlCenter(node, "bottom-right");
				this.createOverlayControl(
					"o-tie-node-add-esc-barrier o-tie-plus-btn",
					sgCenter.x,
					sgCenter.y,
					BowtieView.ICON_SIZE,
					"Add safeguard",
					() => this.addSafeguard(node.ref),
					node.ref,
					"selected"
				);
			}
		} else {
		const deleteBtn = wrap.createEl("button", { cls: "o-tie-node-delete o-tie-close-btn" });
		deleteBtn.setAttribute("aria-label", "Delete");
		deleteBtn.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
		deleteBtn.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.deleteNode(node.ref);
		});

		if (node.kind === "threat" || node.kind === "consequence") {
			const addBar = wrap.createEl("button", { cls: "o-tie-node-add-barrier o-tie-plus-btn" });
			addBar.setAttribute("aria-label", "Add barrier");
			addBar.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
			addBar.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
			addBar.addEventListener("click", (e) => {
				e.stopPropagation();
				if (node.kind === "threat" && node.ref.threatId) {
					this.addPreventionBarrier(node.ref.threatId);
				} else if (node.kind === "consequence" && node.ref.consequenceId) {
					this.addMitigationBarrier(node.ref.consequenceId);
				}
			});
		}

		if (node.kind === "topEvent" && node.ref.eventId) {
			const eventIndex = this.bowtie.events.findIndex((e) => e.id === node.ref.eventId);
			if (eventIndex >= 0 && eventIndex < this.bowtie.events.length - 1) {
				const addBar = wrap.createEl("button", { cls: "o-tie-node-add-barrier o-tie-plus-btn" });
				addBar.setAttribute("aria-label", "Add barrier to next event");
				addBar.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
			addBar.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
				addBar.addEventListener("click", (e) => {
					e.stopPropagation();
					this.addTransitionBarrier(node.ref.eventId!);
				});
			}
		}

		if (isBarrier) {
			const addDeg = wrap.createEl("button", { cls: "o-tie-node-add-escalation", text: "⚡" });
			addDeg.setAttribute("aria-label", "Add degradation factor");
			addDeg.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
			addDeg.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
			addDeg.addEventListener("click", (e) => {
				e.stopPropagation();
				this.addDegradationFactor(node.ref);
			});
		}

		if (node.kind === "degradationFactor") {
			const addSg = wrap.createEl("button", {
				cls: "o-tie-node-add-esc-barrier o-tie-plus-btn",
			});
			addSg.setAttribute("aria-label", "Add safeguard");
			addSg.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
			addSg.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
			addSg.addEventListener("click", (e) => {
				e.stopPropagation();
				this.addSafeguard(node.ref);
			});
		}
		}

		wrap.tabIndex = 0;
		wrap.setAttribute("role", "button");
		wrap.setAttribute("aria-label", node.label?.trim() ? `${node.subtitle}: ${node.label}` : node.subtitle);
		wrap.setAttribute("aria-pressed", this.isNodeSelected(node.ref) ? "true" : "false");

		wrap.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			if (target.closest("button")) return;
			e.stopPropagation();
			this.selectNodeElement(node.ref, wrap);
		});

		wrap.addEventListener("keydown", (e) => {
			if (e.target !== wrap) return;
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				this.selectNodeElement(node.ref, wrap);
			} else if (e.key === "Escape") {
				e.stopPropagation();
				this.clearSelection();
				wrap.blur();
			}
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

		if (this.useOverlayControls) {
			const stackCenter = this.nodeControlCenter(
				node,
				"bottom-right",
				BowtieView.STACK_ADD_SIZE
			);
			this.createOverlayControl(
				"o-tie-stack-add o-tie-plus-btn",
				stackCenter.x,
				stackCenter.y,
				BowtieView.STACK_ADD_SIZE,
				"Add stack row",
				(e) => this.showAddStackRowMenu(e, node.ref),
				node.ref,
				"selected"
			);
		} else {
		const addStack = wrap.createEl("button", {
			cls: "o-tie-stack-add o-tie-plus-btn",
		});
		addStack.setAttribute("aria-label", "Add stack row");
		addStack.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
		addStack.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
		addStack.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showAddStackRowMenu(e, node.ref);
		});
		}

		if (stack.length > 0) {
			const chevron = wrap.createEl("button", {
				cls: `o-tie-stack-chevron${collapsed ? " is-collapsed" : ""}`,
			});
			chevron.setCssStyles({ top: `${headerH}px` });
			chevron.setAttribute("aria-label", collapsed ? "Expand stack" : "Collapse stack");
			chevron.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
			chevron.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
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
		if (ref.kind === "topEvent" && ref.eventId) {
			const eventIndex = this.bowtie.events.findIndex((e) => e.id === ref.eventId);
			if (eventIndex >= 0 && eventIndex < this.bowtie.events.length - 1) {
				menu.addItem((item) =>
					item
						.setTitle("Add barrier to next event")
						.setIcon("shield")
						.onClick(() => this.addTransitionBarrier(ref.eventId!))
				);
			}
		}
		if (
			ref.kind === "preventionBarrier" ||
			ref.kind === "mitigationBarrier" ||
			ref.kind === "transitionBarrier"
		) {
			menu.addItem((item) =>
				item
					.setTitle("Add stack row")
					.setIcon("layers")
					.onClick(() => this.showAddStackRowMenu(event, ref))
			);
			menu.addItem((item) =>
				item
					.setTitle("Add degradation factor")
					.setIcon("zap")
					.onClick(() => this.addDegradationFactor(ref))
			);
		}
		if (ref.kind === "degradationFactor") {
			menu.addItem((item) =>
				item.setTitle("Add safeguard").setIcon("shield").onClick(() => this.addSafeguard(ref))
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

		// onCommit/cancel can detach the focused input (via render), which fires a
		// trailing blur. Guard so commit/cancel run exactly once.
		let finished = false;

		const commit = () => {
			if (finished) return;
			finished = true;
			const v = input.value.trim();
			if (v && v !== initial) {
				this.commitEdit();
				onCommit(v);
			} else {
				el.setText(initial);
			}
		};

		const cancel = () => {
			if (finished) return;
			finished = true;
			el.setText(initial);
		};

		input.addEventListener("blur", commit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commit();
			}
			if (e.key === "Escape") {
				e.preventDefault();
				cancel();
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

		const gestureOptions = { passive: false } as AddEventListenerOptions;

		this.registerDomEvent(
			this.containerEl_,
			"pointerdown",
			(e) => {
				// A click only ever follows immediately after the previous pointerup;
				// clear any stale suppression flag at the start of a new gesture.
				this.suppressNextClick = false;
				const target = e.target as HTMLElement;
				const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
				const onEmptyCanvas = this.isPanZoomTarget(target);
				// On touch/pen, let a single-finger drag pan from anywhere on the
				// canvas (including on top of a node), as long as the finger isn't on
				// an interactive control. A tap still selects the node (see pointerup).
				const fromNode = isTouch && !onEmptyCanvas && !this.isInteractiveControl(target);
				if (!onEmptyCanvas && !fromNode) return;

				if (isTouch && onEmptyCanvas) {
					e.preventDefault();
					e.stopPropagation();
				}

				this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

				if (this.activePointers.size === 2) {
					this.endPan();
					this.pinchLastDistance = this.pointerDistance();
					return;
				}

				if (this.activePointers.size === 1) {
					this.panPointerId = e.pointerId;
					this.pinchLastDistance = null;
					this.gestureMoved = false;
					this.panStartedOnNode = fromNode;
					this.containerEl_.setPointerCapture(e.pointerId);
					this.startPan(e.clientX, e.clientY);
				}
			},
			gestureOptions
		);

		this.registerDomEvent(
			this.containerEl_,
			"pointermove",
			(e) => {
				if (!this.activePointers.has(e.pointerId)) return;

				if (this.shouldBlockGesture()) {
					e.preventDefault();
					e.stopPropagation();
				}

				this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

				if (this.activePointers.size >= 2) {
					this.handlePinchZoom();
					return;
				}

				if (this.isPanning && e.pointerId === this.panPointerId) {
					this.updatePan(e.clientX, e.clientY);
				}
			},
			gestureOptions
		);

		const releasePointer = (e: PointerEvent): void => {
			if (!this.activePointers.has(e.pointerId)) return;
			this.activePointers.delete(e.pointerId);

			if (this.containerEl_.hasPointerCapture(e.pointerId)) {
				this.containerEl_.releasePointerCapture(e.pointerId);
			}

			if (this.activePointers.size < 2) {
				this.pinchLastDistance = null;
			}

			if (e.pointerId === this.panPointerId) {
				// A drag that began on a node must not also fire the node's tap-select
				// click. A pure tap (no movement) falls through and selects normally.
				if (this.gestureMoved && this.panStartedOnNode) {
					this.suppressNextClick = true;
				}
				this.panStartedOnNode = false;
				this.endPan();
			}

			if (this.activePointers.size === 1) {
				const remaining = this.activePointers.entries().next().value as
					| [number, { x: number; y: number }]
					| undefined;
				if (remaining) {
					const [pointerId, point] = remaining;
					this.panPointerId = pointerId;
					this.pinchLastDistance = null;
					this.containerEl_.setPointerCapture(pointerId);
					this.startPan(point.x, point.y);
				}
			}
		};

		this.registerDomEvent(this.containerEl_, "pointerup", releasePointer);
		this.registerDomEvent(this.containerEl_, "pointercancel", releasePointer);

		// Block Obsidian app swipe gestures while a finger is on the canvas.
		this.registerDomEvent(
			this.containerEl_,
			"touchstart",
			(e) => {
				const target = e.target as HTMLElement;
				if (this.isCanvasControl(target)) return;
				if (e.touches.length === 1) {
					this.canvasTouchShield = true;
					if (this.isPanZoomTarget(target)) {
						this.shieldCanvasTouch(e);
					}
				} else {
					this.canvasTouchShield = true;
					this.shieldCanvasTouch(e);
				}
			},
			gestureOptions
		);

		this.registerDomEvent(
			this.containerEl_,
			"touchmove",
			(e) => {
				if (!this.canvasTouchShield) return;
				this.shieldCanvasTouch(e, true);
			},
			gestureOptions
		);

		const endCanvasTouchShield = (): void => {
			this.canvasTouchShield = false;
		};
		this.registerDomEvent(this.containerEl_, "touchend", endCanvasTouchShield, gestureOptions);
		this.registerDomEvent(this.containerEl_, "touchcancel", endCanvasTouchShield, gestureOptions);

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
					const factor = wheelFactorFromDelta(dy, this.wheelCtrlKey);
					this.zoomAt(this.wheelClient.x, this.wheelClient.y, factor);
				});
			},
			{ passive: false }
		);

		this.registerDomEvent(
			this.containerEl_,
			"click",
			(e) => {
				if (this.suppressNextClick) {
					this.suppressNextClick = false;
					e.stopPropagation();
					e.preventDefault();
				}
			},
			{ capture: true }
		);

		this.registerDomEvent(this.containerEl_, "click", (e) => {
			if ((e.target as HTMLElement).closest(".o-tie-node-wrap")) return;
			this.clearSelection();
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
		return normalizeWheelDelta(
			e.deltaY,
			e.deltaMode,
			16,
			this.containerEl_.clientHeight || window.innerHeight
		);
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

		if (this.useCssZoom) {
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

		this.updateOverlayPositions();
	}

	private scheduleViewSave(): void {
		if (this.viewSaveTimeout !== null) window.clearTimeout(this.viewSaveTimeout);
		this.viewSaveTimeout = window.setTimeout(() => {
			this.viewSaveTimeout = null;
			this.scheduleSave();
		}, 500);
	}

	private setupExternalSync(): void {
		if (this.externalSyncReady) return;
		this.externalSyncReady = true;

		new ExternalSync({
			app: this.app,
			getFile: () => this.file,
			getLocalBowtie: () => this.bowtie,
			getViewData: () => this.getViewData(),
			getLocalData: () => this.data,
			hasPendingSave: () => this.saveTimeout !== null,
			getLastSelfSaveAt: () => this.lastSelfSaveAt,
			applyDiskData: (disk) => this.setViewData(disk, false),
			registerEvent: (ref) => this.registerEvent(ref),
		}).start();
	}

	private worldToScreen(wx: number, wy: number): { x: number; y: number } {
		const view = this.bowtie.view ?? { zoom: 1, panX: 0, panY: 0 };
		return { x: wx * view.zoom + view.panX, y: wy * view.zoom + view.panY };
	}

	/** Match desktop corner buttons: anchor on corner + translate(±40%, ±40%). */
	private nodeControlCenter(
		node: { x: number; y: number; width: number; height: number },
		corner: "top-right" | "bottom-right" | "bottom-left",
		size = BowtieView.ICON_SIZE
	): { x: number; y: number } {
		const shift = size * 0.4;
		const half = size / 2;
		switch (corner) {
			case "top-right":
				return {
					x: node.x + node.width - half + shift,
					y: node.y + half - shift,
				};
			case "bottom-right":
				return {
					x: node.x + node.width - half + shift,
					y: node.y + node.height - half + shift,
				};
			case "bottom-left":
				return {
					x: node.x + half - shift,
					y: node.y + node.height - half + shift,
				};
		}
	}

	private placeOverlayControl(
		el: HTMLElement,
		worldCenterX: number,
		worldCenterY: number,
		baseSize: number
	): void {
		const view = this.bowtie.view ?? { zoom: 1, panX: 0, panY: 0 };
		const { x, y } = this.worldToScreen(worldCenterX, worldCenterY);
		const half = baseSize / 2;
		el.setCssStyles({
			left: `${x - half}px`,
			top: `${y - half}px`,
			width: `${baseSize}px`,
			height: `${baseSize}px`,
			transform: `scale(${view.zoom})`,
			transformOrigin: "center center",
		});
	}

	private createOverlayControl(
		cls: string,
		worldCenterX: number,
		worldCenterY: number,
		size: number,
		ariaLabel: string,
		onClick: (event: MouseEvent) => void,
		nodeRef?: NodeRef,
		visibility: "always" | "selected" = "selected",
		text?: string
	): HTMLElement {
		const visible =
			!nodeRef || visibility === "always" || this.isNodeSelected(nodeRef);
		const el = this.overlayEl.createDiv({ cls });
		el.setAttribute("role", "button");
		el.setAttribute("tabindex", "0");
		el.setAttribute("aria-label", ariaLabel);
		if (text) el.setText(text);
		if (nodeRef) {
			el.dataset.nodeRef = nodeRefKey(nodeRef);
			el.dataset.visibility = visibility;
		}
		el.dataset.worldCx = String(worldCenterX);
		el.dataset.worldCy = String(worldCenterY);
		el.dataset.overlaySize = String(size);
		if (!visible) el.addClass("o-tie-overlay-hidden");
		this.placeOverlayControl(el, worldCenterX, worldCenterY, size);
		el.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
		el.addEventListener("click", (e) => {
			e.stopPropagation();
			onClick(e);
		});
		return el;
	}

	private updateOverlayPositions(): void {
		if (!this.overlayEl) return;
		this.overlayEl.querySelectorAll<HTMLElement>("[data-world-cx]").forEach((el) => {
			const cx = parseFloat(el.dataset.worldCx ?? "0");
			const cy = parseFloat(el.dataset.worldCy ?? "0");
			const size = parseFloat(el.dataset.overlaySize ?? String(BowtieView.ICON_SIZE));
			this.placeOverlayControl(el, cx, cy, size);
		});
	}

	private updateOverlayVisibility(): void {
		if (!this.useOverlayControls || !this.overlayEl) return;
		this.overlayEl.querySelectorAll<HTMLElement>("[data-node-ref]").forEach((el) => {
			const refKey = el.dataset.nodeRef;
			const always = el.dataset.visibility === "always";
			const selected =
				!!this.selectedRef &&
				!!refKey &&
				nodeRefKey(this.selectedRef) === refKey;
			if (always || selected) el.removeClass("o-tie-overlay-hidden");
			else el.addClass("o-tie-overlay-hidden");
		});
	}

	private isNodeSelected(ref: NodeRef): boolean {
		return !!this.selectedRef && nodeRefKey(this.selectedRef) === nodeRefKey(ref);
	}

	private canvasTouchShield = false;

	private isCanvasControl(target: HTMLElement): boolean {
		return !!(
			target.closest(".o-tie-controls-overlay [role='button']") ||
			target.closest(".o-tie-toolbar-reveal") ||
			target.closest("button")
		);
	}

	private shieldCanvasTouch(e: TouchEvent, allowOffTarget = false): void {
		const target = e.target as HTMLElement;
		if (this.isCanvasControl(target)) return;
		if (!allowOffTarget && !this.containerEl_?.contains(target)) return;
		e.preventDefault();
		e.stopPropagation();
	}

	private isInteractiveControl(target: HTMLElement): boolean {
		return !!(
			target.closest(".o-tie-controls-overlay") ||
			target.closest(".o-tie-lane-add") ||
			target.closest("button") ||
			target.closest('[role="button"]')
		);
	}

	private isPanZoomTarget(target: HTMLElement): boolean {
		return !(target.closest(".o-tie-node-wrap") || this.isInteractiveControl(target));
	}

	private blockCanvasGesture(e: Event): void {
		e.stopPropagation();
		if (e.cancelable) e.preventDefault();
	}

	private startPan(clientX: number, clientY: number): void {
		this.isPanning = true;
		this.panStart = { x: clientX, y: clientY };
		this.panOrigin = {
			x: this.bowtie.view?.panX ?? 0,
			y: this.bowtie.view?.panY ?? 0,
		};
		this.containerEl_.addClass("o-tie-panning");
		this.contentEl.addClass("o-tie-panning");
	}

	private updatePan(clientX: number, clientY: number): void {
		if (!this.isPanning) return;
		const dx = clientX - this.panStart.x;
		const dy = clientY - this.panStart.y;
		if (!this.gestureMoved && Math.hypot(dx, dy) > 6) this.gestureMoved = true;
		if (!this.bowtie.view) this.bowtie.view = { zoom: 1, panX: 0, panY: 0 };
		this.bowtie.view.panX = this.panOrigin.x + dx;
		this.bowtie.view.panY = this.panOrigin.y + dy;
		this.applyTransform();
	}

	private endPan(): void {
		if (!this.isPanning) return;
		this.isPanning = false;
		this.panPointerId = null;
		this.containerEl_.removeClass("o-tie-panning");
		this.contentEl.removeClass("o-tie-panning");
		this.scheduleViewSave();
	}

	private shouldBlockGesture(): boolean {
		return this.isPanning || this.activePointers.size >= 2;
	}

	private pointerDistance(): number {
		const pts = Array.from(this.activePointers.values());
		if (pts.length < 2) return 0;
		return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
	}

	private pointerMidpoint(): { x: number; y: number } {
		const pts = Array.from(this.activePointers.values());
		return {
			x: (pts[0].x + pts[1].x) / 2,
			y: (pts[0].y + pts[1].y) / 2,
		};
	}

	private handlePinchZoom(): void {
		const distance = this.pointerDistance();
		if (distance <= 0) return;
		if (this.pinchLastDistance !== null && this.pinchLastDistance > 0) {
			const factor = distance / this.pinchLastDistance;
			const mid = this.pointerMidpoint();
			this.zoomAt(mid.x, mid.y, factor);
		}
		this.pinchLastDistance = distance;
	}

	private zoomAt(clientX: number, clientY: number, factor: number): void {
		if (!this.bowtie.view) this.bowtie.view = { zoom: 1, panX: 0, panY: 0 };
		const rect = this.containerEl_.getBoundingClientRect();
		const next = computeZoomAt(this.bowtie.view, clientX - rect.left, clientY - rect.top, factor);
		if (!next) return;
		this.bowtie.view = next;
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
		for (const event of this.bowtie.events) {
			for (const barrier of event.transitionBarriers) {
				callback(barrier);
			}
		}
		for (const threat of this.bowtie.threats) {
			for (const barrier of threat.preventionBarriers) {
				callback(barrier);
			}
		}
		for (const consequence of this.bowtie.consequences) {
			for (const barrier of consequence.mitigationBarriers) {
				callback(barrier);
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

		this.bowtie.view = computeFit(
			layout.bounds.width,
			layout.bounds.height,
			rect.width,
			rect.height,
			40
		);
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

	private addTopEvent(): void {
		this.commitEdit();
		this.bowtie.events.push(createTopEvent("New event"));
		this.render();
		this.scheduleSave();
		new Notice("Top event added.");
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
		if (this.selectedRef?.kind === "topEvent" && this.selectedRef.eventId) {
			const eventIndex = this.bowtie.events.findIndex((e) => e.id === this.selectedRef!.eventId);
			if (eventIndex >= 0 && eventIndex < this.bowtie.events.length - 1) {
				this.addTransitionBarrier(this.selectedRef.eventId);
				return;
			}
		}
		if (this.bowtie.threats.length > 0) {
			this.addPreventionBarrier(this.bowtie.threats[0].id);
			return;
		}
		if (this.bowtie.consequences.length > 0) {
			this.addMitigationBarrier(this.bowtie.consequences[0].id);
			return;
		}
		const lastEvent = this.bowtie.events[this.bowtie.events.length - 1];
		const prevEvent = this.bowtie.events[this.bowtie.events.length - 2];
		if (prevEvent && lastEvent) {
			this.addTransitionBarrier(prevEvent.id);
			return;
		}
		new Notice("Add a threat, consequence, or event first, then add barriers.");
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

	private addTransitionBarrier(eventId: string): void {
		const event = this.bowtie.events.find((e) => e.id === eventId);
		if (!event) return;
		const eventIndex = this.bowtie.events.findIndex((e) => e.id === eventId);
		if (eventIndex < 0 || eventIndex >= this.bowtie.events.length - 1) {
			new Notice("Barriers can only be added between consecutive events.");
			return;
		}
		this.commitEdit();
		event.transitionBarriers.push(createBarrier("New barrier"));
		this.selectedRef = { kind: "topEvent", eventId };
		this.render();
		this.scheduleSave();
		new Notice("Barrier added between events.");
	}

	private renderLaneAddButtons(layout: import("./layout").LayoutResult): void {
		const firstTopEvent = layout.nodes.find((n) => n.kind === "topEvent");
		const lastTopEvent = [...layout.nodes].reverse().find((n) => n.kind === "topEvent");
		if (!firstTopEvent || !lastTopEvent) return;

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
			const pos = this.laneAddPosition(fromNode, firstTopEvent, layout);
			if (!pos) continue;

			this.createLaneAddButton(pos.x, pos.y, "Add prevention barrier", () =>
				this.addPreventionBarrier(threat.id)
			);
		}

		for (let i = 0; i < this.bowtie.events.length - 1; i++) {
			const event = this.bowtie.events[i];
			const fromEventNode = layout.nodes.find(
				(n) => n.kind === "topEvent" && n.ref.eventId === event.id
			);
			const toEventNode = layout.nodes.find(
				(n) => n.kind === "topEvent" && n.ref.eventId === this.bowtie.events[i + 1].id
			);
			if (!fromEventNode || !toEventNode) continue;

			const lastTransition = this.findLastBarrierInLane(
				layout,
				(n) => n.kind === "transitionBarrier" && n.ref.eventId === event.id
			);
			const fromNode = lastTransition ?? fromEventNode;
			const pos = this.laneAddPosition(fromNode, toEventNode, layout);
			if (!pos) continue;

			this.createLaneAddButton(pos.x, pos.y, "Add barrier between events", () =>
				this.addTransitionBarrier(event.id)
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

			const fromNode = lastMitigation ?? lastTopEvent;
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
		if (this.useOverlayControls) {
			const half = BowtieView.LANE_ADD_SIZE / 2;
			this.createOverlayControl(
				"o-tie-lane-add o-tie-plus-btn",
				x + half,
				y + half,
				BowtieView.LANE_ADD_SIZE,
				label,
				() => onClick()
			);
			return;
		}

		const btn = this.nodesEl.createEl("button", { cls: "o-tie-lane-add o-tie-plus-btn" });
		btn.setCssStyles({ left: `${x}px`, top: `${y}px` });
		btn.setAttribute("aria-label", label);
		btn.addEventListener("mousedown", (e) => this.blockCanvasGesture(e));
		btn.addEventListener("pointerdown", (e) => this.blockCanvasGesture(e));
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			onClick();
		});
	}

	private addDegradationFactor(ref: NodeRef): void {
		const barrier = this.findBarrier(ref);
		if (!barrier) return;
		this.commitEdit();
		barrier.degradationChains.push(createDegradationChain("Degradation factor"));
		this.render();
		this.scheduleSave();
	}

	private addSafeguard(ref: NodeRef): void {
		const chain = this.findDegradationChain(ref);
		if (!chain) return;
		this.commitEdit();
		chain.safeguards.push(createEscalationNode("Safeguard"));
		this.render();
		this.scheduleSave();
	}

	private findDegradationChain(ref: NodeRef): DegradationChain | null {
		const barrier = this.findBarrier(ref);
		if (!barrier || !ref.chainId) return null;
		return barrier.degradationChains.find((c) => c.id === ref.chainId) ?? null;
	}

	private findSafeguard(ref: NodeRef): EscalationNode | null {
		const chain = this.findDegradationChain(ref);
		if (!chain || !ref.safeguardId) return null;
		return chain.safeguards.find((sg) => sg.id === ref.safeguardId) ?? null;
	}

	private findBarrier(ref: NodeRef): Barrier | null {
		if (ref.eventId && ref.barrierId) {
			const event = this.bowtie.events.find((e) => e.id === ref.eventId);
			return event?.transitionBarriers.find((b) => b.id === ref.barrierId) ?? null;
		}
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

	private findTopEvent(ref: NodeRef) {
		if (!ref.eventId) return null;
		return this.bowtie.events.find((e) => e.id === ref.eventId) ?? null;
	}

	private getNodeLabel(ref: NodeRef): string {
		switch (ref.kind) {
			case "hazard": {
				const event = this.findTopEvent(ref);
				return event?.hazard ?? "";
			}
			case "topEvent": {
				const event = this.findTopEvent(ref);
				return event?.label ?? "";
			}
			case "threat": {
				const t = this.bowtie.threats.find((x) => x.id === ref.threatId);
				return t?.label ?? "";
			}
			case "consequence": {
				const c = this.bowtie.consequences.find((x) => x.id === ref.consequenceId);
				return c?.label ?? "";
			}
			case "preventionBarrier":
			case "mitigationBarrier":
			case "transitionBarrier": {
				const b = this.findBarrier(ref);
				return b?.label ?? "";
			}
			case "safeguard": {
				const sg = this.findSafeguard(ref);
				return sg?.label ?? "";
			}
			case "degradationFactor": {
				const chain = this.findDegradationChain(ref);
				return chain?.degradationFactor.label ?? "";
			}
		}
	}

	private getNodeSubtitle(ref: NodeRef): string {
		const map: Record<string, string> = {
			hazard: "Hazard",
			topEvent: "Top event",
			threat: "Threat",
			consequence: "Consequence",
			preventionBarrier: "Prevention barrier",
			mitigationBarrier: "Mitigation barrier",
			transitionBarrier: "Barrier",
			safeguard: "Safeguard",
			degradationFactor: "Degradation factor",
		};
		return map[ref.kind] ?? ref.kind;
	}

	private getNodeNotes(ref: NodeRef): string {
		switch (ref.kind) {
			case "topEvent": {
				const event = this.findTopEvent(ref);
				return event?.notes ?? "";
			}
			case "threat": {
				const t = this.bowtie.threats.find((x) => x.id === ref.threatId);
				return t?.notes ?? "";
			}
			case "consequence": {
				const c = this.bowtie.consequences.find((x) => x.id === ref.consequenceId);
				return c?.notes ?? "";
			}
			case "preventionBarrier":
			case "mitigationBarrier":
			case "transitionBarrier": {
				const b = this.findBarrier(ref);
				return b?.notes ?? "";
			}
			case "safeguard": {
				const sg = this.findSafeguard(ref);
				return sg?.notes ?? "";
			}
			case "degradationFactor": {
				const chain = this.findDegradationChain(ref);
				return chain?.degradationFactor.notes ?? "";
			}
		}
		return "";
	}

	private setNodeLabel(ref: NodeRef, label: string): void {
		switch (ref.kind) {
			case "hazard": {
				const event = this.findTopEvent(ref);
				if (event) event.hazard = label;
				break;
			}
			case "topEvent": {
				const event = this.findTopEvent(ref);
				if (event) event.label = label;
				break;
			}
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
			case "mitigationBarrier":
			case "transitionBarrier": {
				const b = this.findBarrier(ref);
				if (b) b.label = label;
				break;
			}
			case "safeguard": {
				const sg = this.findSafeguard(ref);
				if (sg) sg.label = label;
				break;
			}
			case "degradationFactor": {
				const chain = this.findDegradationChain(ref);
				if (chain) chain.degradationFactor.label = label;
				break;
			}
		}
	}

	private setNodeNotes(ref: NodeRef, notes: string): void {
		switch (ref.kind) {
			case "topEvent": {
				const event = this.findTopEvent(ref);
				if (event) event.notes = notes;
				break;
			}
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
			case "mitigationBarrier":
			case "transitionBarrier": {
				const b = this.findBarrier(ref);
				if (b) b.notes = notes;
				break;
			}
			case "safeguard": {
				const sg = this.findSafeguard(ref);
				if (sg) sg.notes = notes;
				break;
			}
			case "degradationFactor": {
				const chain = this.findDegradationChain(ref);
				if (chain) chain.degradationFactor.notes = notes;
				break;
			}
		}
	}

	private deleteNode(ref: NodeRef): void {
		this.commitEdit();
		switch (ref.kind) {
			case "hazard": {
				const event = this.findTopEvent(ref);
				if (event) event.hazard = "";
				break;
			}
			case "topEvent": {
				if (this.bowtie.events.length <= 1) {
					const event = this.findTopEvent(ref);
					if (event) event.label = "";
					break;
				}
				this.bowtie.events = this.bowtie.events.filter((e) => e.id !== ref.eventId);
				break;
			}
			case "transitionBarrier": {
				const event = this.bowtie.events.find((e) => e.id === ref.eventId);
				if (event) {
					event.transitionBarriers = event.transitionBarriers.filter(
						(b) => b.id !== ref.barrierId
					);
				}
				break;
			}
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
			case "safeguard": {
				const chain = this.findDegradationChain(ref);
				if (chain) {
					chain.safeguards = chain.safeguards.filter((sg) => sg.id !== ref.safeguardId);
				}
				break;
			}
			case "degradationFactor": {
				const barrier = this.findBarrier(ref);
				if (barrier && ref.chainId) {
					barrier.degradationChains = barrier.degradationChains.filter(
						(c) => c.id !== ref.chainId
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
