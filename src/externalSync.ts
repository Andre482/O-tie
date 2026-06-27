import { App, type EventRef, TFile } from "obsidian";
import { type Bowtie, bowtieStructureSignature, deserializeBowtie } from "./model";

export interface ExternalSyncHost {
	app: App;
	getFile: () => TFile | null;
	getLocalBowtie: () => Bowtie;
	getViewData: () => string;
	getLocalData: () => string;
	hasPendingSave: () => boolean;
	getLastSelfSaveAt: () => number;
	applyDiskData: (disk: string) => void;
	registerEvent: (ref: EventRef) => void;
}

/**
 * Reloads the view when the underlying .bowtie file changes on disk (e.g. via
 * Obsidian Sync), but only when the change is genuinely external and there are
 * no unsaved local edits.
 */
export class ExternalSync {
	private started = false;

	constructor(private readonly host: ExternalSyncHost) {}

	start(): void {
		if (this.started) return;
		this.started = true;
		this.host.registerEvent(
			this.host.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile) || file !== this.host.getFile()) return;
				if (Date.now() - this.host.getLastSelfSaveAt() < 3000) return;
				void this.handle(file);
			})
		);
	}

	private async handle(file: TFile): Promise<void> {
		const disk = await this.host.app.vault.read(file);
		if (disk === this.host.getLocalData() || disk === this.host.getViewData()) return;

		let diskBowtie: Bowtie;
		try {
			diskBowtie = deserializeBowtie(disk);
		} catch {
			return;
		}

		if (bowtieStructureSignature(diskBowtie) === bowtieStructureSignature(this.host.getLocalBowtie())) {
			return;
		}
		if (this.host.hasPendingSave()) return;

		this.host.applyDiskData(disk);
	}
}
