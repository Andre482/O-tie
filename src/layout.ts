import type { Barrier, Bowtie, Consequence, Threat } from "./model";
import type { NodeKind, NodeRef } from "./model";

export interface LayoutConfig {
	nodeWidth: number;
	nodeHeight: number;
	hazardHeight: number;
	barrierWidth: number;
	barrierHeight: number;
	barrierHeaderHeight: number;
	barrierStackRowHeight: number;
	escalationWidth: number;
	escalationHeight: number;
	columnGap: number;
	rowGap: number;
	barrierGap: number;
	escalationOffsetY: number;
	padding: number;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
	nodeWidth: 200,
	nodeHeight: 72,
	hazardHeight: 56,
	barrierWidth: 140,
	barrierHeight: 52,
	barrierHeaderHeight: 52,
	barrierStackRowHeight: 24,
	escalationWidth: 130,
	escalationHeight: 44,
	columnGap: 100,
	rowGap: 48,
	barrierGap: 24,
	escalationOffsetY: 70,
	padding: 80,
};

const LABEL_LINE_HEIGHT = 16;
const LABEL_PAD_Y = 22;
const LABEL_PAD_X = 16;
const STRIPE_HEIGHT = 18;
const AVG_CHAR_WIDTH = 5.4;
const BARRIER_HEADER_BUFFER = 8;
const NODE_BOX_BUFFER = 8;
const ESCALATION_NODE_BUFFER = 6;
const ESCALATION_GAP_FACTOR = 0.5;

function estimateLabelLines(label: string, width: number): number {
	const text = label?.trim() ?? "";
	if (!text) return 1;

	const usable = Math.max(20, width - LABEL_PAD_X);
	const charsPerLine = Math.max(6, Math.floor(usable / AVG_CHAR_WIDTH));
	const words = text.split(/\s+/).filter(Boolean);

	let lines = 1;
	let lineLen = 0;
	for (const word of words) {
		const wordLen = word.length;
		if (wordLen > charsPerLine) {
			if (lineLen > 0) {
				lines++;
				lineLen = 0;
			}
			lines += Math.ceil(wordLen / charsPerLine) - 1;
			lineLen = wordLen % charsPerLine || charsPerLine;
			continue;
		}

		const space = lineLen > 0 ? 1 : 0;
		if (lineLen + space + wordLen > charsPerLine) {
			lines++;
			lineLen = wordLen;
		} else {
			lineLen += space + wordLen;
		}
	}

	return Math.max(1, lines);
}

function labelBlockHeight(label: string, width: number): number {
	return estimateLabelLines(label, width) * LABEL_LINE_HEIGHT + LABEL_PAD_Y;
}

export function nodeBoxHeight(
	label: string,
	width: number,
	minHeight: number,
	extraBuffer = 0
): number {
	return Math.max(
		minHeight,
		STRIPE_HEIGHT + labelBlockHeight(label, width) + NODE_BOX_BUFFER + extraBuffer
	);
}

export function escalationNodeHeight(
	label: string,
	width: number,
	minHeight: number
): number {
	return nodeBoxHeight(label, width, minHeight, ESCALATION_NODE_BUFFER);
}

export function barrierHeaderHeightFor(barrier: Barrier, layout: LayoutConfig): number {
	return Math.max(
		layout.barrierHeaderHeight,
		STRIPE_HEIGHT +
			labelBlockHeight(barrier.label || "Barrier", layout.barrierWidth) +
			BARRIER_HEADER_BUFFER
	);
}

export function barrierRenderHeight(barrier: Barrier, layout: LayoutConfig): number {
	const stack = barrier.stack ?? [];
	const collapsed = barrier.stackCollapsed ?? true;
	const stackHeight =
		!collapsed && stack.length > 0 ? stack.length * layout.barrierStackRowHeight : 0;
	return barrierHeaderHeightFor(barrier, layout) + stackHeight;
}

export interface PositionedNode {
	ref: NodeRef;
	kind: NodeKind;
	label: string;
	subtitle: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface EdgeArrow {
	x: number;
	y: number;
	angleDeg: number;
}

export interface EdgePath {
	id: string;
	path: string;
	kind: "main" | "hazard" | "escalation";
	fromRef: NodeRef;
	toRef: NodeRef;
	arrow: EdgeArrow;
}

export interface LayoutResult {
	nodes: PositionedNode[];
	edges: EdgePath[];
	bounds: { width: number; height: number };
}

function placeBarriersInLane(
	startX: number,
	laneWidth: number,
	count: number,
	barrierWidth: number,
	barrierGap: number
): number[] {
	if (count === 0) return [];
	const usedWidth = count * barrierWidth + Math.max(0, count - 1) * barrierGap;
	const offset = (laneWidth - usedWidth) / 2;
	return Array.from(
		{ length: count },
		(_, i) => startX + offset + i * (barrierWidth + barrierGap)
	);
}

function nodeRight(node: PositionedNode): { x: number; y: number } {
	return { x: node.x + node.width, y: node.y + node.height / 2 };
}

function nodeLeft(node: PositionedNode): { x: number; y: number } {
	return { x: node.x, y: node.y + node.height / 2 };
}

/** Port points used for main-flow bezier edges between two nodes. */
export function connectionPorts(
	from: PositionedNode,
	to: PositionedNode
): { from: { x: number; y: number }; to: { x: number; y: number } } {
	return { from: nodeRight(from), to: nodeLeft(to) };
}

/** Point on the same cubic bezier as {@link makeBezierEdge} at parameter t (0–1). */
export function bezierPointAt(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	t: number,
	curve = 0.35
): { x: number; y: number } {
	const dx = (x2 - x1) * curve;
	const p1x = x1 + dx;
	const p1y = y1;
	const p2x = x2 - dx;
	const p2y = y2;
	const mt = 1 - t;
	const mt2 = mt * mt;
	const t2 = t * t;
	return {
		x: mt2 * mt * x1 + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t2 * t * x2,
		y: mt2 * mt * y1 + 3 * mt2 * t * p1y + 3 * mt * t2 * p2y + t2 * t * y2,
	};
}

function nodeBottom(node: PositionedNode): { x: number; y: number } {
	return { x: node.x + node.width / 2, y: node.y + node.height };
}

function nodeTop(node: PositionedNode): { x: number; y: number } {
	return { x: node.x + node.width / 2, y: node.y };
}

const ARROW_TIP_OVERLAP = 3;
const NODE_PORT_INSET = 1.5;

/** Tangent angle near the path end. */
function bezierEndTangentDeg(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	curve = 0.35,
	t = 0.96
): number {
	const dx = (x2 - x1) * curve;
	const p1x = x1 + dx;
	const p1y = y1;
	const p2x = x2 - dx;
	const p2y = y2;
	const mt = 1 - t;
	const dydt =
		3 * mt * mt * (p1y - y1) + 6 * mt * t * (p2y - p1y) + 3 * t * t * (y2 - p2y);
	const dxdt =
		3 * mt * mt * (p1x - x1) + 6 * mt * t * (p2x - p1x) + 3 * t * t * (x2 - p2x);
	return (Math.atan2(dydt, dxdt) * 180) / Math.PI;
}

function bezierStartTangentDeg(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	curve = 0.35
): number {
	const dx = (x2 - x1) * curve;
	return (Math.atan2(0, dx) * 180) / Math.PI;
}

function insetPort(x: number, y: number, angleDeg: number, inset: number): { x: number; y: number } {
	const rad = (angleDeg * Math.PI) / 180;
	return {
		x: x - Math.cos(rad) * inset,
		y: y - Math.sin(rad) * inset,
	};
}

function makeBezierEdge(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	curve = 0.35
): { path: string; arrow: EdgeArrow } {
	const endAngleDeg = bezierEndTangentDeg(x1, y1, x2, y2, curve);
	const endRad = (endAngleDeg * Math.PI) / 180;
	const start = insetPort(
		x1,
		y1,
		bezierStartTangentDeg(x1, y1, x2, y2, curve),
		NODE_PORT_INSET
	);
	const dx = (x2 - x1) * curve;
	return {
		path: `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
		arrow: {
			x: x2 + Math.cos(endRad) * ARROW_TIP_OVERLAP,
			y: y2 + Math.sin(endRad) * ARROW_TIP_OVERLAP,
			angleDeg: endAngleDeg,
		},
	};
}

function makeLineEdge(
	x1: number,
	y1: number,
	x2: number,
	y2: number
): { path: string; arrow: EdgeArrow } {
	const angleDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
	const rad = (angleDeg * Math.PI) / 180;
	const start = insetPort(x1, y1, angleDeg, NODE_PORT_INSET);
	return {
		path: `M ${start.x} ${start.y} L ${x2} ${y2}`,
		arrow: {
			x: x2 + Math.cos(rad) * ARROW_TIP_OVERLAP,
			y: y2 + Math.sin(rad) * ARROW_TIP_OVERLAP,
			angleDeg,
		},
	};
}

function escalationFactorGap(layout: LayoutConfig): number {
	return layout.rowGap * 0.35;
}

function escalationColumnHeight(barrier: Barrier, layout: LayoutConfig): number {
	const factors = barrier.escalationFactors;
	if (factors.length === 0) return 0;

	const factorGap = escalationFactorGap(layout);
	const escGap = 12;
	let height = 0;

	factors.forEach((factor, factorIndex) => {
		if (factorIndex > 0) height += factorGap;
		height += escalationNodeHeight(
			factor.label || "Escalation",
			layout.escalationWidth,
			layout.escalationHeight
		);
		factor.escalationBarriers.forEach((escBarrier, escIndex) => {
			height +=
				(escIndex === 0 ? layout.rowGap * 0.5 : escGap) +
				escalationNodeHeight(
					escBarrier.label || "Esc. Barrier",
					layout.escalationWidth,
					layout.escalationHeight
				);
		});
	});

	return layout.escalationOffsetY * ESCALATION_GAP_FACTOR + height;
}

function escalationExtraForBarriers(barriers: Barrier[], layout: LayoutConfig): number {
	let maxExtra = 0;
	for (const barrier of barriers) {
		maxExtra = Math.max(maxExtra, escalationColumnHeight(barrier, layout));
	}
	return maxExtra;
}

function threatRowHeight(threat: Threat, layout: LayoutConfig): number {
	let maxBarrierH = layout.barrierHeaderHeight;
	for (const barrier of threat.preventionBarriers) {
		maxBarrierH = Math.max(maxBarrierH, barrierRenderHeight(barrier, layout));
	}
	const threatH = nodeBoxHeight(
		threat.label || "Threat",
		layout.nodeWidth,
		layout.nodeHeight
	);
	return Math.max(threatH, maxBarrierH) + escalationExtraForBarriers(threat.preventionBarriers, layout);
}

function consequenceRowHeight(consequence: Consequence, layout: LayoutConfig): number {
	let maxBarrierH = layout.barrierHeaderHeight;
	for (const barrier of consequence.mitigationBarriers) {
		maxBarrierH = Math.max(maxBarrierH, barrierRenderHeight(barrier, layout));
	}
	const consequenceH = nodeBoxHeight(
		consequence.label || "Consequence",
		layout.nodeWidth,
		layout.nodeHeight
	);
	return (
		Math.max(consequenceH, maxBarrierH) +
		escalationExtraForBarriers(consequence.mitigationBarriers, layout)
	);
}

function sumRowHeights(heights: number[], rowGap: number): number {
	if (heights.length === 0) return 0;
	return heights.reduce((sum, h) => sum + h, 0) + Math.max(0, heights.length - 1) * rowGap;
}

function estimateLaneHeight(bowtie: Bowtie, layout: LayoutConfig): number {
	const threatHeights = bowtie.threats.map((t) => threatRowHeight(t, layout));
	const consequenceHeights = bowtie.consequences.map((c) => consequenceRowHeight(c, layout));
	const leftHeight = sumRowHeights(threatHeights, layout.rowGap) || layout.nodeHeight;
	const rightHeight = sumRowHeights(consequenceHeights, layout.rowGap) || layout.nodeHeight;
	return Math.max(leftHeight, rightHeight);
}

function computeRowYPositions(heights: number[], contentTop: number, rowGap: number): number[] {
	if (heights.length === 0) return [];
	const positions: number[] = [];
	let y = contentTop;
	for (const height of heights) {
		positions.push(y);
		y += height + rowGap;
	}
	return positions;
}

export function layoutBowtie(bowtie: Bowtie, layout: LayoutConfig = DEFAULT_LAYOUT): LayoutResult {
	const nodes: PositionedNode[] = [];
	const edges: EdgePath[] = [];

	const laneHeight = estimateLaneHeight(bowtie, layout);
	const centerY = layout.padding + laneHeight / 2;

	const maxBarriersLeft = Math.max(
		0,
		...bowtie.threats.map((t) => t.preventionBarriers.length)
	);
	const maxBarriersRight = Math.max(
		0,
		...bowtie.consequences.map((c) => c.mitigationBarriers.length)
	);

	const threatColX = layout.padding;
	const preventionStartX =
		threatColX + layout.nodeWidth + layout.columnGap * 0.4;
	const preventionEndX =
		layout.padding +
		layout.nodeWidth +
		layout.columnGap +
		maxBarriersLeft * (layout.barrierWidth + layout.barrierGap);

	const centerX = preventionEndX + layout.columnGap * 0.5;
	const topEventSize = Math.max(layout.nodeWidth, layout.nodeHeight);

	const mitigationStartX = centerX + topEventSize + layout.columnGap * 0.5;
	const consequenceColX =
		mitigationStartX +
		maxBarriersRight * (layout.barrierWidth + layout.barrierGap) +
		layout.columnGap;

	const hazardH = nodeBoxHeight(
		bowtie.hazard || "Hazard",
		layout.nodeWidth,
		layout.hazardHeight
	);
	const hazardNode: PositionedNode = {
		ref: { kind: "hazard" },
		kind: "hazard",
		label: bowtie.hazard || "Hazard",
		subtitle: "Hazard",
		x: centerX,
		y: centerY - topEventSize / 2 - hazardH - layout.rowGap,
		width: layout.nodeWidth,
		height: hazardH,
	};
	nodes.push(hazardNode);

	const topEventNode: PositionedNode = {
		ref: { kind: "topEvent" },
		kind: "topEvent",
		label: bowtie.topEvent || "Top Event",
		subtitle: "Top Event",
		x: centerX,
		y: centerY - topEventSize / 2,
		width: topEventSize,
		height: topEventSize,
	};
	nodes.push(topEventNode);

	{
		const from = nodeBottom(hazardNode);
		const to = nodeTop(topEventNode);
		const edge = makeLineEdge(from.x, from.y, to.x, to.y);
		edges.push({
			id: "hazard-top",
			path: edge.path,
			kind: "hazard",
			fromRef: hazardNode.ref,
			toRef: topEventNode.ref,
			arrow: edge.arrow,
		});
	}

	const contentTop = layout.padding;
	const threatRowHeights = bowtie.threats.map((t) => threatRowHeight(t, layout));
	const consequenceRowHeights = bowtie.consequences.map((c) => consequenceRowHeight(c, layout));
	const threatYs = computeRowYPositions(threatRowHeights, contentTop, layout.rowGap);
	const consequenceYs = computeRowYPositions(consequenceRowHeights, contentTop, layout.rowGap);

	bowtie.threats.forEach((threat, threatIndex) => {
		const y = threatYs[threatIndex];

		const threatNode: PositionedNode = {
			ref: { kind: "threat", threatId: threat.id },
			kind: "threat",
			label: threat.label || "Threat",
			subtitle: "Threat",
			x: threatColX,
			y,
			width: layout.nodeWidth,
			height: nodeBoxHeight(threat.label || "Threat", layout.nodeWidth, layout.nodeHeight),
		};
		nodes.push(threatNode);

		const chain: PositionedNode[] = [threatNode];
		const barrierCount = threat.preventionBarriers.length;
		const laneWidth = preventionEndX - preventionStartX;
		const preventionPositions = placeBarriersInLane(
			preventionStartX,
			laneWidth,
			barrierCount,
			layout.barrierWidth,
			layout.barrierGap
		);

		threat.preventionBarriers.forEach((barrier, barrierIndex) => {
			const bx = preventionPositions[barrierIndex];
			const barrierHeight = barrierRenderHeight(barrier, layout);
			const barrierNode: PositionedNode = {
				ref: {
					kind: "preventionBarrier",
					threatId: threat.id,
					barrierId: barrier.id,
				},
				kind: "preventionBarrier",
				label: barrier.label || "Barrier",
				subtitle: "Prevention",
				x: bx,
				y,
				width: layout.barrierWidth,
				height: barrierHeight,
			};
			nodes.push(barrierNode);
			chain.push(barrierNode);

			layoutEscalation(barrier, barrierNode, nodes, edges, layout);
		});

		chain.push(topEventNode);
		for (let i = 0; i < chain.length - 1; i++) {
			const from = chain[i];
			const to = chain[i + 1];
			const p1 = nodeRight(from);
			const p2 = nodeLeft(to);
			const edge = makeBezierEdge(p1.x, p1.y, p2.x, p2.y);
			edges.push({
				id: `edge-${from.ref.kind}-${to.ref.kind}-${i}`,
				path: edge.path,
				kind: "main",
				fromRef: from.ref,
				toRef: to.ref,
				arrow: edge.arrow,
			});
		}
	});

	bowtie.consequences.forEach((consequence, consequenceIndex) => {
		const y = consequenceYs[consequenceIndex];

		const consequenceNode: PositionedNode = {
			ref: { kind: "consequence", consequenceId: consequence.id },
			kind: "consequence",
			label: consequence.label || "Consequence",
			subtitle: "Consequence",
			x: consequenceColX,
			y,
			width: layout.nodeWidth,
			height: nodeBoxHeight(
				consequence.label || "Consequence",
				layout.nodeWidth,
				layout.nodeHeight
			),
		};
		nodes.push(consequenceNode);

		const chain: PositionedNode[] = [topEventNode];
		const barrierCount = consequence.mitigationBarriers.length;
		const laneWidth = consequenceColX - mitigationStartX;
		const mitigationPositions = placeBarriersInLane(
			mitigationStartX,
			laneWidth,
			barrierCount,
			layout.barrierWidth,
			layout.barrierGap
		);

		consequence.mitigationBarriers.forEach((barrier, barrierIndex) => {
			const bx = mitigationPositions[barrierIndex];
			const barrierHeight = barrierRenderHeight(barrier, layout);
			const barrierNode: PositionedNode = {
				ref: {
					kind: "mitigationBarrier",
					consequenceId: consequence.id,
					barrierId: barrier.id,
				},
				kind: "mitigationBarrier",
				label: barrier.label || "Barrier",
				subtitle: "Mitigation",
				x: bx,
				y,
				width: layout.barrierWidth,
				height: barrierHeight,
			};
			nodes.push(barrierNode);
			chain.push(barrierNode);

			layoutEscalation(barrier, barrierNode, nodes, edges, layout, consequence.id);
		});

		chain.push(consequenceNode);
		for (let i = 0; i < chain.length - 1; i++) {
			const from = chain[i];
			const to = chain[i + 1];
			const p1 = nodeRight(from);
			const p2 = nodeLeft(to);
			const edge = makeBezierEdge(p1.x, p1.y, p2.x, p2.y);
			edges.push({
				id: `edge-${from.ref.kind}-${to.ref.kind}-${i}-r`,
				path: edge.path,
				kind: "main",
				fromRef: from.ref,
				toRef: to.ref,
				arrow: edge.arrow,
			});
		}
	});

	let maxX = consequenceColX + layout.nodeWidth + layout.padding;
	let maxY = layout.padding + laneHeight + layout.padding;

	for (const node of nodes) {
		maxX = Math.max(maxX, node.x + node.width + layout.padding);
		maxY = Math.max(maxY, node.y + node.height + layout.padding);
	}

	return {
		nodes,
		edges,
		bounds: { width: maxX, height: maxY },
	};
}

function layoutEscalation(
	barrier: import("./model").Barrier,
	barrierNode: PositionedNode,
	nodes: PositionedNode[],
	edges: EdgePath[],
	layout: LayoutConfig,
	consequenceId?: string
): void {
	const threatId = barrierNode.ref.threatId;
	const factorGap = escalationFactorGap(layout);
	const escGap = 12;
	const baseY = barrierNode.y + barrierNode.height + layout.escalationOffsetY * ESCALATION_GAP_FACTOR;
	const factorX = barrierNode.x + barrierNode.width / 2 - layout.escalationWidth / 2;

	let attachFrom: PositionedNode = barrierNode;
	let nextY = baseY;

	barrier.escalationFactors.forEach((factor, factorIndex) => {
		if (factorIndex > 0) nextY += factorGap;

		const factorH = escalationNodeHeight(
			factor.label || "Escalation",
			layout.escalationWidth,
			layout.escalationHeight
		);
		const factorNode: PositionedNode = {
			ref: {
				kind: "escalationFactor",
				threatId,
				consequenceId,
				barrierId: barrier.id,
				escalationId: factor.id,
			},
			kind: "escalationFactor",
			label: factor.label || "Escalation",
			subtitle: "Escalation Factor",
			x: factorX,
			y: nextY,
			width: layout.escalationWidth,
			height: factorH,
		};
		nodes.push(factorNode);
		nextY += factorH;

		const b1 = nodeBottom(attachFrom);
		const b2 = nodeTop(factorNode);
		const escEdge = makeLineEdge(b1.x, b1.y, b2.x, b2.y);
		edges.push({
			id: `esc-${barrier.id}-${factor.id}`,
			path: escEdge.path,
			kind: "escalation",
			fromRef: attachFrom.ref,
			toRef: factorNode.ref,
			arrow: escEdge.arrow,
		});
		attachFrom = factorNode;

		factor.escalationBarriers.forEach((escBarrier, escIndex) => {
			nextY += escIndex === 0 ? layout.rowGap * 0.5 : escGap;

			const escH = escalationNodeHeight(
				escBarrier.label || "Esc. Barrier",
				layout.escalationWidth,
				layout.escalationHeight
			);
			const escNode: PositionedNode = {
				ref: {
					kind: "escalationBarrier",
					threatId,
					consequenceId,
					barrierId: barrier.id,
					escalationId: factor.id,
					escalationBarrierId: escBarrier.id,
				},
				kind: "escalationBarrier",
				label: escBarrier.label || "Esc. Barrier",
				subtitle: "Escalation Barrier",
				x: factorX,
				y: nextY,
				width: layout.escalationWidth,
				height: escH,
			};
			nodes.push(escNode);
			nextY += escH;

			const e1 = nodeBottom(attachFrom);
			const e2 = nodeTop(escNode);
			const escEdge = makeLineEdge(e1.x, e1.y, e2.x, e2.y);
			edges.push({
				id: `escb-${factor.id}-${escBarrier.id}`,
				path: escEdge.path,
				kind: "escalation",
				fromRef: attachFrom.ref,
				toRef: escNode.ref,
				arrow: escEdge.arrow,
			});
			attachFrom = escNode;
		});
	});
}
