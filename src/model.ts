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
			{ label: "Passive Hardware", color: "#7f8c8d" },
			{ label: "Continuous Hardware", color: "#1abc9c" },
			{ label: "Active Hardware", color: "#48c9b0" },
			{ label: "Active Hardware+Human", color: "#3498db" },
			{ label: "Active Human", color: "#5dade2" },
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

export interface EscalationNode {
	id: string;
	label: string;
	notes?: string;
}

export interface DegradationChain {
	id: string;
	safeguards: EscalationNode[];
	degradationFactor: EscalationNode;
}

export interface Barrier {
	id: string;
	label: string;
	notes?: string;
	color?: string;
	effectiveness?: BarrierEffectiveness;
	degradationChains: DegradationChain[];
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

export interface TopEvent {
	id: string;
	label: string;
	hazard: string;
	notes?: string;
	transitionBarriers: Barrier[];
}

export interface BowtieViewState {
	zoom: number;
	panX: number;
	panY: number;
}

export interface Bowtie {
	id: string;
	name: string;
	events: TopEvent[];
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

export function createDegradationChain(label = "Degradation factor"): DegradationChain {
	return {
		id: generateId(),
		safeguards: [],
		degradationFactor: createEscalationNode(label),
	};
}

export function createBarrier(label = ""): Barrier {
	return {
		id: generateId(),
		label,
		degradationChains: [],
		stack: [],
		stackCollapsed: true,
	};
}

export function createEscalationNode(label = ""): EscalationNode {
	return {
		id: generateId(),
		label,
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

export function createTopEvent(label = "", hazard = "Hazard"): TopEvent {
	return {
		id: generateId(),
		label,
		hazard,
		transitionBarriers: [],
	};
}

export function createBowtie(name: string): Bowtie {
	const now = new Date().toISOString();
	return {
		id: generateId(),
		name,
		events: [createTopEvent("", "")],
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
	const raw = JSON.parse(json) as Bowtie & { topEvent?: string; hazard?: string };
	migrateLegacyBowtie(raw);
	validateBowtie(raw);
	raw.view = sanitizeViewState(raw.view);
	return raw;
}

const VIEW_MIN_ZOOM = 0.2;
const VIEW_MAX_ZOOM = 3;

function sanitizeNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeViewState(view: BowtieViewState | undefined): BowtieViewState {
	if (!view || typeof view !== "object") {
		return { zoom: 1, panX: 0, panY: 0 };
	}
	const zoom = sanitizeNumber(view.zoom, 1);
	return {
		zoom: Math.min(VIEW_MAX_ZOOM, Math.max(VIEW_MIN_ZOOM, zoom)),
		panX: sanitizeNumber(view.panX, 0),
		panY: sanitizeNumber(view.panY, 0),
	};
}

function migrateLegacyBowtie(data: Bowtie & { topEvent?: string; hazard?: string }): void {
	const legacyHazard = typeof data.hazard === "string" ? data.hazard : "";
	if (!Array.isArray(data.events)) {
		const legacyLabel = typeof data.topEvent === "string" ? data.topEvent : "";
		data.events = [createTopEvent(legacyLabel, legacyHazard)];
	}
	delete data.topEvent;
	delete data.hazard;
	if (data.events.length === 0) {
		data.events = [createTopEvent("")];
	}
	if (legacyHazard && !data.events[0].hazard) {
		data.events[0].hazard = legacyHazard;
	}
	for (const event of data.events) {
		if (typeof event.hazard !== "string") {
			event.hazard = "";
		}
	}
}

export function cloneBowtie(bowtie: Bowtie): Bowtie {
	return deserializeBowtie(serializeBowtie(bowtie));
}

type LegacyEscalationFactor = {
	id: string;
	label?: string;
	notes?: string;
	safeguards?: EscalationNode[];
	degradationFactor?: EscalationNode;
	escalationBarriers?: Barrier[];
};

function normalizeBarrier(
	barrier: Barrier & {
		safeguards?: EscalationNode[];
		degradationFactor?: EscalationNode;
		escalationFactors?: LegacyEscalationFactor[];
	}
): void {
	if (!Array.isArray(barrier.degradationChains)) {
		barrier.degradationChains = [];
	}

	if (barrier.safeguards !== undefined || barrier.degradationFactor !== undefined) {
		const safeguards = barrier.safeguards ?? [];
		const degradation = barrier.degradationFactor ?? createEscalationNode("");
		if (safeguards.length > 0 || degradation.label?.trim()) {
			barrier.degradationChains.push({
				id: generateId(),
				safeguards,
				degradationFactor: degradation,
			});
		}
		delete barrier.safeguards;
		delete barrier.degradationFactor;
	}

	if (Array.isArray(barrier.escalationFactors) && barrier.escalationFactors.length > 0) {
		for (const factor of barrier.escalationFactors) {
			const factorSafeguards = Array.isArray(factor.safeguards)
				? factor.safeguards
				: (factor.escalationBarriers ?? []).map((legacyBarrier) => ({
						id: legacyBarrier.id,
						label: legacyBarrier.label,
						notes: legacyBarrier.notes,
					}));
			const safeguards = [...factorSafeguards];
			if (factor.label?.trim()) {
				safeguards.unshift({
					id: factor.id,
					label: factor.label,
					notes: factor.notes,
				});
			}
			barrier.degradationChains.push({
				id: generateId(),
				safeguards,
				degradationFactor:
					factor.degradationFactor ?? createEscalationNode("Degradation factor"),
			});
		}
		delete barrier.escalationFactors;
	}

	if (!Array.isArray(barrier.stack)) {
		barrier.stack = [];
	} else {
		sortBarrierStack(barrier.stack);
	}
	if (barrier.stackCollapsed === undefined) {
		barrier.stackCollapsed = true;
	}
	for (const chain of barrier.degradationChains) {
		if (!Array.isArray(chain.safeguards)) {
			chain.safeguards = [];
		}
		if (!chain.degradationFactor) {
			chain.degradationFactor = createEscalationNode("Degradation factor");
		}
	}
}

function validateBowtie(data: Bowtie): void {
	if (!data.id || !data.name) {
		throw new Error("Invalid bowtie: missing id or name");
	}
	if (!Array.isArray(data.threats) || !Array.isArray(data.consequences)) {
		throw new Error("Invalid bowtie: threats and consequences must be arrays");
	}
	if (!Array.isArray(data.events) || data.events.length === 0) {
		throw new Error("Invalid bowtie: events must be a non-empty array");
	}
	for (const event of data.events) {
		if (typeof event.hazard !== "string") {
			event.hazard = "";
		}
		if (!Array.isArray(event.transitionBarriers)) {
			event.transitionBarriers = [];
		}
		for (const barrier of event.transitionBarriers) {
			normalizeBarrier(barrier);
		}
	}
	for (const threat of data.threats) {
		if (typeof threat.label !== "string") {
			threat.label = "";
		}
		if (!Array.isArray(threat.preventionBarriers)) {
			threat.preventionBarriers = [];
		}
		for (const barrier of threat.preventionBarriers) {
			normalizeBarrier(barrier);
		}
	}
	for (const consequence of data.consequences) {
		if (typeof consequence.label !== "string") {
			consequence.label = "";
		}
		if (!Array.isArray(consequence.mitigationBarriers)) {
			consequence.mitigationBarriers = [];
		}
		for (const barrier of consequence.mitigationBarriers) {
			normalizeBarrier(barrier);
		}
	}
}

export function hasSafeguardChain(barrier: Barrier): boolean {
	return barrier.degradationChains.length > 0;
}

export function getBowtieFilePath(basePath: string): string {
	return `${basePath}${BOWTIE_EXTENSION}`;
}

const WINDOWS_RESERVED_NAMES = new Set([
	"CON", "PRN", "AUX", "NUL",
	"COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
	"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/**
 * Produce a safe base file name (no extension): strips illegal/separator
 * characters, control characters, and leading/trailing dots/spaces, rejects
 * bare "." / "..", and avoids Windows reserved device names.
 */
export function sanitizeBaseName(name: string, fallback = "bowtie"): string {
	let result = name.replace(/[\\/:*?"<>|]/g, "-");
	// eslint-disable-next-line no-control-regex
	result = result.replace(/[\u0000-\u001f]/g, "");
	result = result.replace(/^[\s.]+|[\s.]+$/g, "");
	if (!result || result === "." || result === "..") return fallback;
	if (WINDOWS_RESERVED_NAMES.has(result.toUpperCase())) return `_${result}`;
	return result;
}

export function touchBowtie(bowtie: Bowtie): Bowtie {
	return {
		...bowtie,
		updatedAt: new Date().toISOString(),
	};
}

/** Compare bowtie diagram content, ignoring pan/zoom and save timestamps. */
export function bowtieStructureSignature(bowtie: Bowtie): string {
	const copy = cloneBowtie(bowtie);
	copy.view = { zoom: 1, panX: 0, panY: 0 };
	copy.createdAt = "";
	copy.updatedAt = "";
	return JSON.stringify(copy);
}

export type NodeKind =
	| "hazard"
	| "topEvent"
	| "threat"
	| "consequence"
	| "preventionBarrier"
	| "mitigationBarrier"
	| "transitionBarrier"
	| "safeguard"
	| "degradationFactor";

export interface NodeRef {
	kind: NodeKind;
	eventId?: string;
	threatId?: string;
	consequenceId?: string;
	barrierId?: string;
	chainId?: string;
	safeguardId?: string;
}

export function nodeRefKey(ref: NodeRef): string {
	const parts = [
		ref.kind,
		ref.eventId ?? "",
		ref.threatId ?? "",
		ref.consequenceId ?? "",
		ref.barrierId ?? "",
		ref.chainId ?? "",
		ref.safeguardId ?? "",
	];
	return parts.join(":");
}
