import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { BowtieView } from "./bowtieView";
import { NewBowtieNameModal } from "./editorModal";
import { PLUGIN_ICON, registerPluginIcon, styleRibbonIcon } from "./icons";
import {
	BOWTIE_EXTENSION,
	BOWTIE_VIEW_TYPE,
	createBowtie,
	getBowtieFilePath,
	serializeBowtie,
} from "./model";
import { DEFAULT_SETTINGS, OTieSettingTab, type OTieSettings } from "./settingsTab";

export default class OTiePlugin extends Plugin {
	settings: OTieSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		registerPluginIcon();
		await this.loadSettings();
		this.addSettingTab(new OTieSettingTab(this.app, this));

		this.registerView(BOWTIE_VIEW_TYPE, (leaf) => new BowtieView(leaf, this));
		this.registerExtensions(["bowtie"], BOWTIE_VIEW_TYPE);

		const ribbonBtn = this.addRibbonIcon(PLUGIN_ICON, "Create bowtie", () => {
			void this.createNewBowtie();
		});
		styleRibbonIcon(ribbonBtn);

		this.addCommand({
			id: "create-bowtie",
			name: "Create new bowtie",
			callback: () => void this.createNewBowtie(),
		});

		this.addCommand({
			id: "open-bowtie",
			name: "Open bowtie file",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (file && file.extension === "bowtie") {
					void this.openBowtieFile(file);
				} else {
					new Notice("Open a .bowtie file first.");
				}
			},
		});

		this.addCommand({
			id: "export-bowtie-image",
			name: "Export bowtie as image",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(BowtieView);
				if (view) {
					if (!checking) view.openExportImageModal();
					return true;
				}
				return false;
			},
		});
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<OTieSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		if (!normalized || normalized === ".") return;

		const parts = normalized.split("/");
		let current = "";

		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private sanitizeFileName(name: string): string {
		return name.replace(/[\\/:*?"<>|]/g, "-").trim();
	}

	private async createNewBowtie(): Promise<void> {
		new NewBowtieNameModal(this.app, (name) => {
			void this.createBowtieFromName(name);
		}).open();
	}

	private async createBowtieFromName(name: string): Promise<void> {
		const safeName = this.sanitizeFileName(name);
		const folder = normalizePath(this.settings.defaultFolder);
		await this.ensureFolder(folder);

		const basePath = folder ? `${folder}/${safeName}` : safeName;
		const filePath = getBowtieFilePath(basePath);

		if (this.app.vault.getAbstractFileByPath(filePath)) {
			new Notice(`A bowtie named "${safeName}" already exists.`);
			return;
		}

		const bowtie = createBowtie(name);
		bowtie.events[0].hazard = "Hazard";
		bowtie.events[0].label = "Top Event";

		const file = await this.app.vault.create(filePath, serializeBowtie(bowtie));
		await this.openBowtieFile(file);
	}

	async openBowtieFile(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.openFile(file);
	}

	isBowtieFile(file: TFile): boolean {
		return file.path.endsWith(BOWTIE_EXTENSION) || file.extension === "bowtie";
	}
}
