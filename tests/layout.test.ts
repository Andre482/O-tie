import { describe, expect, it } from "vitest";
import {
	bezierPointAt,
	barrierHeaderHeightFor,
	DEFAULT_LAYOUT,
	layoutBowtie,
	nodeBoxHeight,
} from "../src/layout";
import {
	createBarrier,
	createBowtie,
	createConsequence,
	createThreat,
	type Bowtie,
} from "../src/model";

function sample(): Bowtie {
	const bt = createBowtie("Sample");
	bt.events[0].label = "Top event";
	bt.events[0].hazard = "Hazard";
	const threat = createThreat("Threat");
	threat.preventionBarriers = [createBarrier("Prevention")];
	bt.threats = [threat];
	const consequence = createConsequence("Consequence");
	consequence.mitigationBarriers = [createBarrier("Mitigation")];
	bt.consequences = [consequence];
	return bt;
}

describe("nodeBoxHeight", () => {
	it("respects the minimum height", () => {
		expect(nodeBoxHeight("", 200, 72)).toBeGreaterThanOrEqual(72);
	});

	it("grows for longer labels that wrap", () => {
		const short = nodeBoxHeight("Short", 120, 40);
		const long = nodeBoxHeight(
			"A very long barrier label that will certainly wrap across several lines in a narrow box",
			120,
			40
		);
		expect(long).toBeGreaterThan(short);
	});
});

describe("barrierHeaderHeightFor", () => {
	it("is at least the configured header height", () => {
		const barrier = createBarrier("B");
		expect(barrierHeaderHeightFor(barrier, DEFAULT_LAYOUT)).toBeGreaterThanOrEqual(
			DEFAULT_LAYOUT.barrierHeaderHeight
		);
	});
});

describe("bezierPointAt", () => {
	it("returns endpoints at t=0 and t=1", () => {
		expect(bezierPointAt(0, 0, 100, 0, 0)).toEqual({ x: 0, y: 0 });
		expect(bezierPointAt(0, 0, 100, 0, 1)).toEqual({ x: 100, y: 0 });
	});

	it("returns the midpoint x for a horizontal segment at t=0.5", () => {
		const p = bezierPointAt(0, 0, 100, 0, 0.5);
		expect(p.x).toBeCloseTo(50, 5);
		expect(p.y).toBeCloseTo(0, 5);
	});
});

describe("layoutBowtie", () => {
	it("produces nodes, edges, and positive bounds", () => {
		const layout = layoutBowtie(sample(), DEFAULT_LAYOUT);
		expect(layout.nodes.length).toBeGreaterThan(0);
		expect(layout.edges.length).toBeGreaterThan(0);
		expect(layout.bounds.width).toBeGreaterThan(0);
		expect(layout.bounds.height).toBeGreaterThan(0);
	});

	it("places threat left of top event left of consequence", () => {
		const layout = layoutBowtie(sample(), DEFAULT_LAYOUT);
		const threat = layout.nodes.find((n) => n.kind === "threat")!;
		const topEvent = layout.nodes.find((n) => n.kind === "topEvent")!;
		const consequence = layout.nodes.find((n) => n.kind === "consequence")!;
		expect(threat.x).toBeLessThan(topEvent.x);
		expect(topEvent.x).toBeLessThan(consequence.x);
	});

	it("places the hazard above its top event", () => {
		const layout = layoutBowtie(sample(), DEFAULT_LAYOUT);
		const hazard = layout.nodes.find((n) => n.kind === "hazard")!;
		const topEvent = layout.nodes.find((n) => n.kind === "topEvent")!;
		expect(hazard.y).toBeLessThan(topEvent.y);
	});
});
