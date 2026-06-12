export type BarrierEffectiveness = "effective" | "degraded" | "failed" | "unknown";

export interface BarrierStackItem {
	id: string;
	field?: string;
	label: string;
	color?: string;
}

export interface BarrierStackFieldOption {
	label: string;
	color: string;
}

export interface BarrierStackField {
	key: string;
	name: string;
	options: BarrierStackFieldOption[];
}

export const BARRIER_STACK_FIELDS: BarrierStackField[] = [
	{
		key: "type",
		name: "Barrier type",
		options: [
			{ label: "Active Human", color: "#5dade2" },
			{ label: "Reactive Human", color: "#3498db" },
			{ label: "Active Hardware", color: "#48c9b0" },
			{ label: "Reactive Hardware", color: "#1abc9c" },
			{ label: "Passive Hardware", color: "#7f8c8d" },
		],
	},
	{
		key: "effectiveness",
		name: "Effectiveness",
		options: [
			{ label: "Excellent", color: "#1e8449" },
			{ label: "Good", color: "#27ae60" },
			{ label: "Fair", color: "#f1c40f" },
			{ label: "Poor", color: "#e67e22" },
			{ label: "Failed", color: "#c0392b" },
		],
	},
	{
		key: "criticality",
		name: "Criticality",
		options: [
			{ label: "Very High", color: "#2c3e50" },
			{ label: "High", color: "#566573" },
			{ label: "Medium", color: "#7f8c8d" },
			{ label: "Low", color: "#aab7b8" },
		],
	},
	{
		key: "responsible",
		name: "Responsible",
		options: [
			{ label: "HSE Department", color: "#ffffff" },
			{ label: "Tech Department", color: "#ffffff" },
			{ label: "Operations", color: "#ffffff" },
			{ label: "Management", color: "#ffffff" },
		],
	},
	{
		key: "validation",
		name: "Validation method",
		options: [
			{ label: "Drills and Exercise", color: "#ffffff" },
			{ label: "Barrier Test", color: "#ffffff" },
			{ label: "Inspection", color: "#ffffff" },
			{ label: "Audit", color: "#ffffff" },
		],
	},
	{
		key: "status",
		name: "Status",
		options: [
			{ label: "Available", color: "#1e8449" },
			{ label: "Degraded", color: "#f39c12" },
			{ label: "Unavailable", color: "#c0392b" },
			{ label: "Unknown", color: "#95a5a6" },
		],
	},
];

export interface EscalationFactor {
	id: string;
	label: string;
	notes?: string;
	escalationBarriers: Barrier[];
}

export interface Barrier {
	id: string;
	label: string;
	notes?: string;
	color?: string;
	effectiveness?: BarrierEffectiveness;
	escalationFactors: EscalationFactor[];
	stack?: BarrierStackItem[];
	stackCollapsed?: boolean;
}

export interface Threat {
	id: string;
	label: string;
	notes?: string;
	preventionBarriers: Barrier[];
}

export interface Consequence {
	id: string;
	label: string;
	notes?: string;
	mitigationBarriers: Barrier[];
}

export interface BowtieViewState {
	zoom: number;
	panX: number;
	panY: number;
}

export interface Bowtie {
	id: string;
	name: string;
	hazard: string;
	topEvent: string;
	threats: Threat[];
	consequences: Consequence[];
	view?: BowtieViewState;
	createdAt: string;
	updatedAt: string;
}

export const BOWTIE_EXTENSION = ".bowtie";
export const BOWTIE_VIEW_TYPE = "o-tie-bowtie-view";

export function generateId(): string {
	return crypto.randomUUID();
}

export function stackFieldOrder(fieldKey?: string): number {
	if (!fieldKey) return BARRIER_STACK_FIELDS.length;
	const index = BARRIER_STACK_FIELDS.findIndex((f) => f.key === fieldKey);
	return index >= 0 ? index : BARRIER_STACK_FIELDS.length;
}

export function sortBarrierStack(stack: BarrierStackItem[]): void {
	stack.sort((a, b) => stackFieldOrder(a.field) - stackFieldOrder(b.field));
}

export function createBarrierStackItem(
	label = "",
	field?: string,
	color?: string
): BarrierStackItem {
	return {
		id: generateId(),
		field,
		label,
		color,
	};
}

export function createBarrier(label = ""): Barrier {
	return {
		id: generateId(),
		label,
		escalationFactors: [],
		stack: [],
		stackCollapsed: true,
	};
}

export function createEscalationFactor(label = ""): EscalationFactor {
	return {
		id: generateId(),
		label,
		escalationBarriers: [],
	};
}

export function createThreat(label = ""): Threat {
	return {
		id: generateId(),
		label,
		preventionBarriers: [],
	};
}

export function createConsequence(label = ""): Consequence {
	return {
		id: generateId(),
		label,
		mitigationBarriers: [],
	};
}

export function createBowtie(name: string): Bowtie {
	const now = new Date().toISOString();
	return {
		id: generateId(),
		name,
		hazard: "",
		topEvent: "",
		threats: [],
		consequences: [],
		view: { zoom: 1, panX: 0, panY: 0 },
		createdAt: now,
		updatedAt: now,
	};
}

export function serializeBowtie(bowtie: Bowtie): string {
	return JSON.stringify(bowtie, null, 2);
}

export function deserializeBowtie(json: string): Bowtie {
	const data = JSON.parse(json) as Bowtie;
	validateBowtie(data);
	if (!data.view) {
		data.view = { zoom: 1, panX: 0, panY: 0 };
	}
	return data;
}

export function cloneBowtie(bowtie: Bowtie): Bowtie {
	return deserializeBowtie(serializeBowtie(bowtie));
}

function normalizeBarrier(barrier: Barrier): void {
	if (!Array.isArray(barrier.escalationFactors)) {
		barrier.escalationFactors = [];
	}
	if (!Array.isArray(barrier.stack)) {
		barrier.stack = [];
	} else {
		sortBarrierStack(barrier.stack);
	}
	if (barrier.stackCollapsed === undefined) {
		barrier.stackCollapsed = true;
	}
}

function validateBowtie(data: Bowtie): void {
	if (!data.id || !data.name) {
		throw new Error("Invalid bowtie: missing id or name");
	}
	if (!Array.isArray(data.threats) || !Array.isArray(data.consequences)) {
		throw new Error("Invalid bowtie: threats and consequences must be arrays");
	}
	for (const threat of data.threats) {
		for (const barrier of threat.preventionBarriers) {
			normalizeBarrier(barrier);
		}
	}
	for (const consequence of data.consequences) {
		for (const barrier of consequence.mitigationBarriers) {
			normalizeBarrier(barrier);
		}
	}
}

export function getBowtieFilePath(basePath: string): string {
	return `${basePath}${BOWTIE_EXTENSION}`;
}

export function touchBowtie(bowtie: Bowtie): Bowtie {
	return {
		...bowtie,
		updatedAt: new Date().toISOString(),
	};
}

export type NodeKind =
	| "hazard"
	| "topEvent"
	| "threat"
	| "consequence"
	| "preventionBarrier"
	| "mitigationBarrier"
	| "escalationFactor"
	| "escalationBarrier";

export interface NodeRef {
	kind: NodeKind;
	threatId?: string;
	consequenceId?: string;
	barrierId?: string;
	escalationId?: string;
	escalationBarrierId?: string;
}

export function nodeRefKey(ref: NodeRef): string {
	const parts = [
		ref.kind,
		ref.threatId ?? "",
		ref.consequenceId ?? "",
		ref.barrierId ?? "",
		ref.escalationId ?? "",
		ref.escalationBarrierId ?? "",
	];
	return parts.join(":");
}
