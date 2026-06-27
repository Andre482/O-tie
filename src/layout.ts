import type { Barrier, Bowtie, Consequence, Threat, TopEvent } from "./model";
import { hasSafeguardChain } from "./model";
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
	degradationChainGap: number;
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
	degradationChainGap: 36,
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

function estimateWrappedLines(text: string, charsPerLine: number): number {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return 1;

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

	return lines;
}

function estimateLabelLines(label: string, width: number): number {
	const text = label ?? "";
	if (!text.trim() && !text.includes("\n")) return 1;

	const usable = Math.max(20, width - LABEL_PAD_X);
	const charsPerLine = Math.max(6, Math.floor(usable / AVG_CHAR_WIDTH));
	const paragraphs = text.split("\n");

	let totalLines = 0;
	for (const para of paragraphs) {
		totalLines += para.trim() ? estimateWrappedLines(para, charsPerLine) : 1;
	}

	return Math.max(1, totalLines);
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
	kind: "main" | "hazard" | "safeguard" | "degradation";
	fromRef: NodeRef;
	toRef: NodeRef;
	arrow: EdgeArrow;
}

export interface LayoutResult {
	nodes: PositionedNode[];
	edges: EdgePath[];
	bounds: { width: number; height: number };
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

function degradationChainGap(layout: LayoutConfig): number {
	return layout.degradationChainGap;
}

function degradationChainsFootprint(barrier: Barrier, layout: LayoutConfig): number {
	if (!hasSafeguardChain(barrier)) return layout.barrierWidth;
	const chainCount = barrier.degradationChains.length;
	const chainGap = degradationChainGap(layout);
	return chainCount * layout.escalationWidth + Math.max(0, chainCount - 1) * chainGap;
}

function barrierSlotWidth(barrier: Barrier, layout: LayoutConfig): number {
	const footprint = degradationChainsFootprint(barrier, layout);
	return Math.max(layout.barrierWidth, footprint + 16);
}

function barriersLaneWidth(barriers: Barrier[], layout: LayoutConfig): number {
	if (barriers.length === 0) return 0;
	const slots = barriers.map((b) => barrierSlotWidth(b, layout));
	return slots.reduce((sum, w) => sum + w, 0) + Math.max(0, barriers.length - 1) * layout.barrierGap;
}

interface BarrierSlot {
	x: number;
	slotWidth: number;
}

function layoutBarrierSlots(
	startX: number,
	laneWidth: number,
	barriers: Barrier[],
	layout: LayoutConfig
): BarrierSlot[] {
	if (barriers.length === 0) return [];
	const slotWidths = barriers.map((b) => barrierSlotWidth(b, layout));
	const usedWidth =
		slotWidths.reduce((sum, w) => sum + w, 0) +
		Math.max(0, barriers.length - 1) * layout.barrierGap;
	let slotStart = startX + (laneWidth - usedWidth) / 2;
	const result: BarrierSlot[] = [];
	for (const slotWidth of slotWidths) {
		result.push({
			x: slotStart + (slotWidth - layout.barrierWidth) / 2,
			slotWidth,
		});
		slotStart += slotWidth + layout.barrierGap;
	}
	return result;
}

function degradationChainHeight(chain: import("./model").DegradationChain, layout: LayoutConfig): number {
	const escGap = 12;
	let height = 0;

	chain.safeguards.forEach((safeguard, safeguardIndex) => {
		height +=
			(safeguardIndex === 0 ? layout.rowGap * 0.5 : escGap) +
			escalationNodeHeight(
				safeguard.label || "Safeguard",
				layout.escalationWidth,
				layout.escalationHeight
			);
	});
	height +=
		(chain.safeguards.length === 0 ? layout.rowGap * 0.5 : escGap) +
		escalationNodeHeight(
			chain.degradationFactor.label || "Degradation",
			layout.escalationWidth,
			layout.escalationHeight
		);
	return height;
}

function escalationColumnHeight(barrier: Barrier, layout: LayoutConfig): number {
	if (!hasSafeguardChain(barrier)) return 0;

	const maxChainHeight = Math.max(
		...barrier.degradationChains.map((chain) => degradationChainHeight(chain, layout))
	);

	return layout.escalationOffsetY * ESCALATION_GAP_FACTOR + maxChainHeight;
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

function pushChainEdges(
	chain: PositionedNode[],
	edges: EdgePath[],
	idSuffix: string
): void {
	for (let i = 0; i < chain.length - 1; i++) {
		const from = chain[i];
		const to = chain[i + 1];
		const p1 = nodeRight(from);
		const p2 = nodeLeft(to);
		const edge = makeBezierEdge(p1.x, p1.y, p2.x, p2.y);
		edges.push({
			id: `edge-${from.ref.kind}-${to.ref.kind}-${i}${idSuffix}`,
			path: edge.path,
			kind: "main",
			fromRef: from.ref,
			toRef: to.ref,
			arrow: edge.arrow,
		});
	}
}

export function layoutBowtie(bowtie: Bowtie, layout: LayoutConfig = DEFAULT_LAYOUT): LayoutResult {
	const nodes: PositionedNode[] = [];
	const edges: EdgePath[] = [];

	const laneHeight = estimateLaneHeight(bowtie, layout);
	const centerY = layout.padding + laneHeight / 2;

	const maxBarriersLeft = Math.max(
		0,
		...bowtie.threats.map((t) => barriersLaneWidth(t.preventionBarriers, layout))
	);
	const maxBarriersRight = Math.max(
		0,
		...bowtie.consequences.map((c) => barriersLaneWidth(c.mitigationBarriers, layout))
	);
	const maxTransitionLaneWidth = Math.max(
		0,
		...bowtie.events.slice(0, -1).map((e) => barriersLaneWidth(e.transitionBarriers, layout))
	);

	const threatColX = layout.padding;
	const preventionStartX =
		threatColX + layout.nodeWidth + layout.columnGap * 0.4;
	const preventionEndX =
		layout.padding +
		layout.nodeWidth +
		layout.columnGap +
		maxBarriersLeft;

	const topEventSize = Math.max(layout.nodeWidth, layout.nodeHeight);
	const firstEventX = preventionEndX + layout.columnGap * 0.5;

	const eventPositions: number[] = [];
	const transitionLanes: { startX: number; endX: number; event: TopEvent }[] = [];
	let eventX = firstEventX;

	for (let i = 0; i < bowtie.events.length; i++) {
		eventPositions.push(eventX);
		eventX += topEventSize;

		if (i < bowtie.events.length - 1) {
			const transitionStartX = eventX + layout.columnGap * 0.5;
			const transitionEndX = transitionStartX + layout.columnGap + maxTransitionLaneWidth;
			transitionLanes.push({
				startX: transitionStartX,
				endX: transitionEndX,
				event: bowtie.events[i],
			});
			eventX = transitionEndX + layout.columnGap * 0.5;
		}
	}

	const lastEventX = eventPositions[eventPositions.length - 1] ?? firstEventX;
	const mitigationStartX = lastEventX + topEventSize + layout.columnGap * 0.5;
	const consequenceColX = mitigationStartX + maxBarriersRight + layout.columnGap;

	const topEventNodes: PositionedNode[] = bowtie.events.map((event, index) => {
		const eventNode: PositionedNode = {
			ref: { kind: "topEvent", eventId: event.id },
			kind: "topEvent",
			label: event.label || "Top Event",
			subtitle: "Top Event",
			x: eventPositions[index],
			y: centerY - topEventSize / 2,
			width: topEventSize,
			height: topEventSize,
		};
		nodes.push(eventNode);
		return eventNode;
	});

	bowtie.events.forEach((event, index) => {
		const eventNode = topEventNodes[index];
		if (!eventNode) return;

		const hazardH = nodeBoxHeight(
			event.hazard || "Hazard",
			layout.nodeWidth,
			layout.hazardHeight
		);
		const hazardNode: PositionedNode = {
			ref: { kind: "hazard", eventId: event.id },
			kind: "hazard",
			label: event.hazard || "Hazard",
			subtitle: "Hazard",
			x: eventPositions[index],
			y: centerY - topEventSize / 2 - hazardH - layout.rowGap,
			width: layout.nodeWidth,
			height: hazardH,
		};
		nodes.push(hazardNode);

		const from = nodeBottom(hazardNode);
		const to = nodeTop(eventNode);
		const edge = makeLineEdge(from.x, from.y, to.x, to.y);
		edges.push({
			id: `hazard-top-${event.id}`,
			path: edge.path,
			kind: "hazard",
			fromRef: hazardNode.ref,
			toRef: eventNode.ref,
			arrow: edge.arrow,
		});
	});

	const firstTopEventNode = topEventNodes[0];

	transitionLanes.forEach((lane, laneIndex) => {
		const fromEventNode = topEventNodes[laneIndex];
		const toEventNode = topEventNodes[laneIndex + 1];
		if (!fromEventNode || !toEventNode) return;

		const chain: PositionedNode[] = [fromEventNode];
		const laneWidth = lane.endX - lane.startX;
		const transitionSlots = layoutBarrierSlots(
			lane.startX,
			laneWidth,
			lane.event.transitionBarriers,
			layout
		);
		const y = centerY - topEventSize / 2 + (topEventSize - layout.barrierHeaderHeight) / 2;

		lane.event.transitionBarriers.forEach((barrier, barrierIndex) => {
			const slot = transitionSlots[barrierIndex];
			if (!slot) return;
			const bx = slot.x;
			const barrierHeight = barrierRenderHeight(barrier, layout);
			const barrierNode: PositionedNode = {
				ref: {
					kind: "transitionBarrier",
					eventId: lane.event.id,
					barrierId: barrier.id,
				},
				kind: "transitionBarrier",
				label: barrier.label || "Barrier",
				subtitle: "Barrier",
				x: bx,
				y,
				width: layout.barrierWidth,
				height: barrierHeight,
			};
			nodes.push(barrierNode);
			chain.push(barrierNode);
			layoutEscalation(barrier, barrierNode, nodes, edges, layout, {
				eventId: lane.event.id,
			});
		});

		chain.push(toEventNode);
		pushChainEdges(chain, edges, `-trans-${laneIndex}`);
	});

	const lastTopEventNode = topEventNodes[topEventNodes.length - 1];

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
		const laneWidth = preventionEndX - preventionStartX;
		const preventionSlots = layoutBarrierSlots(
			preventionStartX,
			laneWidth,
			threat.preventionBarriers,
			layout
		);

		threat.preventionBarriers.forEach((barrier, barrierIndex) => {
			const slot = preventionSlots[barrierIndex];
			if (!slot) return;
			const bx = slot.x;
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

		if (firstTopEventNode) {
			chain.push(firstTopEventNode);
			pushChainEdges(chain, edges, "");
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

		const chain: PositionedNode[] = lastTopEventNode ? [lastTopEventNode] : [];
		const laneWidth = consequenceColX - mitigationStartX;
		const mitigationSlots = layoutBarrierSlots(
			mitigationStartX,
			laneWidth,
			consequence.mitigationBarriers,
			layout
		);

		consequence.mitigationBarriers.forEach((barrier, barrierIndex) => {
			const slot = mitigationSlots[barrierIndex];
			if (!slot) return;
			const bx = slot.x;
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

			layoutEscalation(barrier, barrierNode, nodes, edges, layout, {
				consequenceId: consequence.id,
			});
		});

		chain.push(consequenceNode);
		pushChainEdges(chain, edges, "-r");
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
	context: { eventId?: string; consequenceId?: string } = {}
): void {
	if (!hasSafeguardChain(barrier)) return;

	const threatId = barrierNode.ref.threatId;
	const { eventId, consequenceId } = context;
	const escGap = 12;
	const chainGap = degradationChainGap(layout);
	const baseY = barrierNode.y + barrierNode.height + layout.escalationOffsetY * ESCALATION_GAP_FACTOR;
	const chainCount = barrier.degradationChains.length;
	const totalWidth =
		chainCount * layout.escalationWidth + Math.max(0, chainCount - 1) * chainGap;
	const startX = barrierNode.x + barrierNode.width / 2 - totalWidth / 2;

	barrier.degradationChains.forEach((chain, chainIndex) => {
		const chainX = startX + chainIndex * (layout.escalationWidth + chainGap);
		let nextY = baseY;
		let attachFrom: PositionedNode = barrierNode;

		chain.safeguards.forEach((safeguard, safeguardIndex) => {
			nextY += safeguardIndex === 0 ? layout.rowGap * 0.5 : escGap;

			const safeguardH = escalationNodeHeight(
				safeguard.label || "Safeguard",
				layout.escalationWidth,
				layout.escalationHeight
			);
			const safeguardNode: PositionedNode = {
				ref: {
					kind: "safeguard",
					eventId,
					threatId,
					consequenceId,
					barrierId: barrier.id,
					chainId: chain.id,
					safeguardId: safeguard.id,
				},
				kind: "safeguard",
				label: safeguard.label || "Safeguard",
				subtitle: "Safeguard",
				x: chainX,
				y: nextY,
				width: layout.escalationWidth,
				height: safeguardH,
			};
			nodes.push(safeguardNode);
			nextY += safeguardH;

			const e1 = nodeBottom(attachFrom);
			const e2 = nodeTop(safeguardNode);
			const escEdge = makeLineEdge(e1.x, e1.y, e2.x, e2.y);
			edges.push({
				id: `sg-${chain.id}-${safeguard.id}`,
				path: escEdge.path,
				kind: "safeguard",
				fromRef: attachFrom.ref,
				toRef: safeguardNode.ref,
				arrow: escEdge.arrow,
			});
			attachFrom = safeguardNode;
		});

		nextY += chain.safeguards.length === 0 ? layout.rowGap * 0.5 : escGap;
		const degradation = chain.degradationFactor;
		const degradationH = escalationNodeHeight(
			degradation.label || "Degradation",
			layout.escalationWidth,
			layout.escalationHeight
		);
		const degradationNode: PositionedNode = {
			ref: {
				kind: "degradationFactor",
				eventId,
				threatId,
				consequenceId,
				barrierId: barrier.id,
				chainId: chain.id,
			},
			kind: "degradationFactor",
			label: degradation.label || "Degradation factor",
			subtitle: "Degradation Factor",
			x: chainX,
			y: nextY,
			width: layout.escalationWidth,
			height: degradationH,
		};
		nodes.push(degradationNode);

		const d1 = nodeBottom(attachFrom);
		const d2 = nodeTop(degradationNode);
		const degEdge = makeLineEdge(d1.x, d1.y, d2.x, d2.y);
		edges.push({
			id: `deg-${chain.id}-${degradation.id}`,
			path: degEdge.path,
			kind: "degradation",
			fromRef: attachFrom.ref,
			toRef: degradationNode.ref,
			arrow: degEdge.arrow,
		});
	});
}
