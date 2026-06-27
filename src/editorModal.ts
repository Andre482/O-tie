import { App, Modal, Notice, Setting } from "obsidian";

export class NewBowtieNameModal extends Modal {
	private onSubmit: (name: string) => void;

	constructor(app: App, onSubmit: (name: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("o-tie-modal");
		contentEl.createEl("h2", { text: "Create new bowtie" });

		new Setting(contentEl)
			.setName("Bowtie name")
			.setDesc("Used for the file name and diagram title")
			.addText((text) => {
				text.setPlaceholder("E.g. Defective steamcracker");
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") this.submit(text.getValue());
				});
				window.setTimeout(() => text.inputEl.focus(), 50);
			});

		const actions = contentEl.createDiv({ cls: "o-tie-actions" });
		const cancelBtn = actions.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const createBtn = actions.createEl("button", { text: "Create", cls: "mod-cta" });
		createBtn.addEventListener("click", () => {
			const input = contentEl.querySelector("input");
			this.submit(input?.value ?? "");
		});
	}

	private submit(name: string): void {
		const trimmed = name.trim();
		if (!trimmed) {
			new Notice("Please enter a bowtie name.");
			return;
		}
		this.onSubmit(trimmed);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
