import { describe, expect, it } from "vitest";
import {
	bowtieStructureSignature,
	cloneBowtie,
	createBarrier,
	createBowtie,
	createConsequence,
	createThreat,
	deserializeBowtie,
	serializeBowtie,
	type Bowtie,
} from "../src/model";

function sampleBowtie(): Bowtie {
	const bt = createBowtie("Sample");
	bt.events[0].label = "Loss of containment";
	bt.events[0].hazard = "High pressure";
	const threat = createThreat("Corrosion");
	threat.preventionBarriers = [createBarrier("Inspection")];
	bt.threats = [threat];
	bt.consequences = [createConsequence("Fire")];
	return bt;
}

describe("createBowtie", () => {
	it("creates a valid single-event bowtie", () => {
		const bt = createBowtie("New");
		expect(bt.events).toHaveLength(1);
		expect(bt.threats).toEqual([]);
		expect(bt.consequences).toEqual([]);
		expect(bt.id).toBeTruthy();
	});
});

describe("serialize/deserialize", () => {
	it("round-trips structure", () => {
		const bt = sampleBowtie();
		const restored = deserializeBowtie(serializeBowtie(bt));
		expect(restored.name).toBe(bt.name);
		expect(restored.events[0].label).toBe("Loss of containment");
		expect(restored.events[0].hazard).toBe("High pressure");
		expect(restored.threats[0].preventionBarriers[0].label).toBe("Inspection");
		expect(restored.consequences[0].label).toBe("Fire");
	});

	it("adds a default view when missing", () => {
		const bt = sampleBowtie();
		delete bt.view;
		const restored = deserializeBowtie(serializeBowtie(bt));
		expect(restored.view).toEqual({ zoom: 1, panX: 0, panY: 0 });
	});
});

describe("legacy migration", () => {
	it("moves top-level hazard/topEvent into events", () => {
		const legacy = JSON.stringify({
			id: "x",
			name: "Legacy",
			hazard: "Ethylene",
			topEvent: "Loss of containment",
			threats: [],
			consequences: [],
		});
		const bt = deserializeBowtie(legacy);
		expect(bt.events).toHaveLength(1);
		expect(bt.events[0].hazard).toBe("Ethylene");
		expect(bt.events[0].label).toBe("Loss of containment");
		expect((bt as Bowtie & { topEvent?: string }).topEvent).toBeUndefined();
		expect((bt as Bowtie & { hazard?: string }).hazard).toBeUndefined();
	});

	it("converts barrier escalationFactors into degradationChains", () => {
		const legacy = JSON.stringify({
			id: "x",
			name: "Legacy",
			hazard: "H",
			topEvent: "T",
			threats: [
				{
					id: "t1",
					label: "Threat",
					preventionBarriers: [
						{
							id: "b1",
							label: "Barrier",
							escalationFactors: [
								{
									id: "ef1",
									label: "Deferred inspection",
									escalationBarriers: [{ id: "eb1", label: "Audit" }],
								},
							],
						},
					],
				},
			],
			consequences: [],
		});
		const bt = deserializeBowtie(legacy);
		const barrier = bt.threats[0].preventionBarriers[0];
		expect(barrier.degradationChains).toHaveLength(1);
		const chain = barrier.degradationChains[0];
		const labels = chain.safeguards.map((s) => s.label);
		expect(labels).toContain("Deferred inspection");
		expect(labels).toContain("Audit");
		expect((barrier as { escalationFactors?: unknown }).escalationFactors).toBeUndefined();
	});
});

describe("validation", () => {
	it("throws when id or name is missing", () => {
		expect(() => deserializeBowtie(JSON.stringify({ name: "x", events: [{}], threats: [], consequences: [] }))).toThrow();
	});

	it("throws when threats/consequences are not arrays", () => {
		expect(() =>
			deserializeBowtie(JSON.stringify({ id: "a", name: "b", events: [{ hazard: "" }], threats: {}, consequences: [] }))
		).toThrow();
	});

	it("repairs an empty events array into a single event", () => {
		const bt = deserializeBowtie(
			JSON.stringify({ id: "a", name: "b", events: [], threats: [], consequences: [] })
		);
		expect(bt.events).toHaveLength(1);
		expect(typeof bt.events[0].hazard).toBe("string");
	});
});

describe("bowtieStructureSignature", () => {
	it("ignores view and timestamps", () => {
		const a = sampleBowtie();
		const b = cloneBowtie(a);
		b.view = { zoom: 2, panX: 100, panY: 50 };
		b.updatedAt = "2099-01-01T00:00:00.000Z";
		b.createdAt = "2099-01-01T00:00:00.000Z";
		expect(bowtieStructureSignature(a)).toBe(bowtieStructureSignature(b));
	});

	it("changes when content changes", () => {
		const a = sampleBowtie();
		const b = cloneBowtie(a);
		b.threats[0].label = "Different";
		expect(bowtieStructureSignature(a)).not.toBe(bowtieStructureSignature(b));
	});
});
