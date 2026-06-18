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

		new Setting(containerEl).setName("O-Tie Settings").setHeading();

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

		new Setting(containerEl)
			.setName("Column gap")
			.setDesc("Horizontal spacing between bowtie columns (pixels)")
			.addText((text) =>
				text
					.setPlaceholder("120")
					.setValue(String(this.plugin.settings.columnGap))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.columnGap = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Row gap")
			.setDesc("Vertical spacing between threats/consequences (pixels)")
			.addText((text) =>
				text
					.setPlaceholder("40")
					.setValue(String(this.plugin.settings.rowGap))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.rowGap = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Node width")
			.setDesc("Default width of bowtie nodes (pixels)")
			.addText((text) =>
				text
					.setPlaceholder("220")
					.setValue(String(this.plugin.settings.nodeWidth))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.nodeWidth = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Node height")
			.setDesc("Default height of bowtie nodes (pixels)")
			.addText((text) =>
				text
					.setPlaceholder("80")
					.setValue(String(this.plugin.settings.nodeHeight))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.nodeHeight = parsed;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
