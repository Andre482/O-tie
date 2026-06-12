import { App, Modal, Notice, Setting } from "obsidian";
import {
	downloadPng,
	rasterizeBowtieForExport,
	sanitizeExportFilename,
	type BowtieExportArea,
	type BowtieExportViewport,
} from "./exportImage";

export interface BowtieExportRequest {
	svgEl: SVGSVGElement;
	nodesEl: HTMLElement;
	viewRootEl: HTMLElement;
	bounds: { width: number; height: number };
	viewport?: BowtieExportViewport;
	bowtieName: string;
	onExpandStacks?: () => Promise<void>;
	onRestoreStacks?: () => void;
}

export class ExportImageModal extends Modal {
	private readonly request: BowtieExportRequest;
	private area: BowtieExportArea = "full";
	private scale = 2;
	private showGrid = true;
	private expandStacks = true;
	private isExporting = false;

	constructor(app: App, request: BowtieExportRequest) {
		super(app);
		this.request = request;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("o-tie-modal", "o-tie-export-modal");
		contentEl.createEl("h2", { text: "Export as image" });

		contentEl.createEl("p", {
			cls: "o-tie-export-desc",
			text: "Save the bowtie diagram as a high-resolution PNG. Increase zoom for sharper text and details.",
		});

		new Setting(contentEl)
			.setName("Area")
			.setDesc("Export the full diagram or only the visible canvas area")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("full", "Full diagram")
					.addOption("viewport", "Visible area")
					.setValue(this.area)
					.onChange((value) => {
						this.area = value as BowtieExportArea;
					})
			);

		new Setting(contentEl)
			.setName("Zoom")
			.setDesc(`${this.scale}x — higher values produce a larger, sharper image`)
			.addSlider((slider) =>
				slider
					.setLimits(1, 4, 0.5)
					.setValue(this.scale)
					.setDynamicTooltip()
					.onChange((value) => {
						this.scale = value;
					})
			);

		new Setting(contentEl)
			.setName("Show grid")
			.setDesc("Include the dotted canvas background")
			.addToggle((toggle) =>
				toggle.setValue(this.showGrid).onChange((value) => {
					this.showGrid = value;
				})
			);

		new Setting(contentEl)
			.setName("Expand barrier stacks")
			.setDesc("Show all barrier analysis rows in the export")
			.addToggle((toggle) =>
				toggle.setValue(this.expandStacks).onChange((value) => {
					this.expandStacks = value;
				})
			);

		const actions = contentEl.createDiv({ cls: "o-tie-actions" });
		const cancelBtn = actions.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const exportBtn = actions.createEl("button", {
			text: "Export",
			cls: "mod-cta",
		});
		exportBtn.addEventListener("click", () => void this.exportImage(exportBtn));
	}

	private async exportImage(exportBtn: HTMLButtonElement): Promise<void> {
		if (this.isExporting) return;
		this.isExporting = true;
		exportBtn.disabled = true;
		exportBtn.setText("Exporting…");

		const backgroundColor =
			getComputedStyle(this.request.viewRootEl).backgroundColor || "#ffffff";

		try {
			if (this.expandStacks && this.request.onExpandStacks) {
				await this.request.onExpandStacks();
			}

			const blob = await rasterizeBowtieForExport({
				svgEl: this.request.svgEl,
				nodesEl: this.request.nodesEl,
				viewRootEl: this.request.viewRootEl,
				bounds: this.request.bounds,
				area: this.area,
				scale: this.scale,
				showGrid: this.showGrid,
				viewport: this.area === "viewport" ? this.request.viewport : undefined,
				backgroundColor,
			});

			const filename = `${sanitizeExportFilename(this.request.bowtieName)}.png`;
			downloadPng(blob, filename);
			new Notice(`Exported ${filename}`);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Export failed.";
			new Notice(`Export failed: ${message}`);
		} finally {
			if (this.expandStacks && this.request.onRestoreStacks) {
				this.request.onRestoreStacks();
			}
			this.isExporting = false;
			exportBtn.disabled = false;
			exportBtn.setText("Export");
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
