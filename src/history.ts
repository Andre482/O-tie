import { type Bowtie, cloneBowtie, type NodeRef } from "./model";

export interface BowtieSnapshot {
	bowtie: Bowtie;
	selection: NodeRef | null;
}

function snapshot(bowtie: Bowtie, selection: NodeRef | null): BowtieSnapshot {
	return {
		bowtie: cloneBowtie(bowtie),
		selection: selection ? { ...selection } : null,
	};
}

/** Undo/redo stack of bowtie snapshots with the selection at edit time. */
export class BowtieHistory {
	private undoStack: BowtieSnapshot[] = [];
	private redoStack: BowtieSnapshot[] = [];

	constructor(private readonly maxUndo = 50) {}

	reset(): void {
		this.undoStack = [];
		this.redoStack = [];
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/** Record the state immediately before an edit; clears the redo stack. */
	record(bowtie: Bowtie, selection: NodeRef | null): void {
		this.undoStack.push(snapshot(bowtie, selection));
		if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
		this.redoStack = [];
	}

	undo(currentBowtie: Bowtie, currentSelection: NodeRef | null): BowtieSnapshot | null {
		if (this.undoStack.length === 0) return null;
		this.redoStack.push(snapshot(currentBowtie, currentSelection));
		return this.undoStack.pop() ?? null;
	}

	redo(currentBowtie: Bowtie, currentSelection: NodeRef | null): BowtieSnapshot | null {
		if (this.redoStack.length === 0) return null;
		this.undoStack.push(snapshot(currentBowtie, currentSelection));
		return this.redoStack.pop() ?? null;
	}
}
