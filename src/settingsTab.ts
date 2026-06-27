import { App, PluginSettingTab, Setting } from "obsidian";
import type OTiePlugin from "./main";

export interface OTieSettings {
	defaultFolder: string;
	columnGap: number;
	rowGap: number;
	nodeWidth: number;
	nodeHeight: number;
}

export const DEFAULT_SETTINGS: OTieSettings = {
	defaultFolder: "Bowties",
	columnGap: 120,
	rowGap: 40,
	nodeWidth: 220,
	nodeHeight: 80,
};

export class OTieSettingTab extends PluginSettingTab {
	plugin: OTiePlugin;

	constructor(app: App, plugin: OTiePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default folder")
			.setDesc("Folder where new bowtie files are created")
			.addText((text) =>
				text
					.setPlaceholder("Bowties")
					.setValue(this.plugin.settings.defaultFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultFolder = value.trim() || "Bowties";
						await this.plugin.saveSettings();
					})
			);

		this.addPixelSetting(
			containerEl,
			"Column gap",
			"Horizontal spacing between bowtie columns (pixels)",
			120,
			() => this.plugin.settings.columnGap,
			(v) => (this.plugin.settings.columnGap = v)
		);

		this.addPixelSetting(
			containerEl,
			"Row gap",
			"Vertical spacing between threats/consequences (pixels)",
			40,
			() => this.plugin.settings.rowGap,
			(v) => (this.plugin.settings.rowGap = v)
		);

		this.addPixelSetting(
			containerEl,
			"Node width",
			"Default width of bowtie nodes (pixels)",
			220,
			() => this.plugin.settings.nodeWidth,
			(v) => (this.plugin.settings.nodeWidth = v)
		);

		this.addPixelSetting(
			containerEl,
			"Node height",
			"Default height of bowtie nodes (pixels)",
			80,
			() => this.plugin.settings.nodeHeight,
			(v) => (this.plugin.settings.nodeHeight = v)
		);
	}

	private addPixelSetting(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		placeholder: number,
		get: () => number,
		set: (value: number) => void
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) => {
				text
					.setPlaceholder(String(placeholder))
					.setValue(String(get()))
					.onChange(async (value) => {
						const parsed = Number(value.trim());
						const valid = Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 && parsed <= 2000;
						text.inputEl.toggleClass("o-tie-setting-invalid", !valid);
						text.inputEl.setAttribute("aria-invalid", valid ? "false" : "true");
						if (!valid) {
							text.inputEl.title = "Enter a whole number of pixels between 1 and 2000";
							return;
						}
						text.inputEl.title = "";
						set(parsed);
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "number";
				text.inputEl.inputMode = "numeric";
				text.inputEl.min = "1";
				text.inputEl.max = "2000";
			});
	}
}
