// Generates authentic O-Tie diagram screenshots for the README.
//
// It reuses the plugin's real layout engine (src/layout.ts) and stylesheet
// (styles.css), reproduces the same node/edge DOM the plugin renders, and
// captures it with headless Chromium. The output mirrors the plugin's "Export
// as image" appearance (no editing chrome).
//
// Usage:  npm run screenshots
// Requires Chromium once:  npx playwright install chromium

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine } from "./engine.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, "..");
const assetsDir = join(root, "assets");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");

// Light-theme stand-ins for the Obsidian CSS variables the canvas relies on.
const THEME_VARS = `
	--background-primary: #ffffff;
	--background-secondary: #f4f6f8;
	--background-modifier-border: #d6dae0;
	--background-modifier-border-hover: #c2c8d0;
	--background-modifier-hover: #ecedf1;
	--text-normal: #1a1a1a;
	--text-muted: #5d6d7e;
	--text-error: #c0392b;
	--interactive-accent: #7b6cf6;
	--radius-s: 4px;
	--font-ui-smaller: 11px;
	--font-interface: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
`;

const LIGHT_STACK_ROW_COLORS = new Set(["#ffffff", "#f4ecf7", "#eafaf1"]);

function isLightStackColor(color) {
	if (LIGHT_STACK_ROW_COLORS.has(color)) return true;
	const match = /^#([0-9a-f]{6})$/i.exec(color);
	if (!match) return false;
	const n = parseInt(match[1], 16);
	const r = (n >> 16) & 0xff;
	const g = (n >> 8) & 0xff;
	const b = n & 0xff;
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function fieldColor(model, fieldKey, label) {
	const field = model.BARRIER_STACK_FIELDS.find((f) => f.key === fieldKey);
	const option = field?.options.find((o) => o.label === label);
	return option?.color;
}

function addStack(model, barrier, rows) {
	barrier.stack = rows.map(([field, label]) =>
		model.createBarrierStackItem(label, field, fieldColor(model, field, label))
	);
	model.sortBarrierStack?.(barrier.stack);
	barrier.stackCollapsed = false;
}

// Representative cold-storage ammonia scenario (matches the docs example).
function buildHeroBowtie(model) {
	const bt = model.createBowtie("Cold storage ammonia — LOPC");
	bt.events[0].label = "Loss of primary containment";
	bt.events[0].hazard = "Pressurised anhydrous ammonia";

	const mi = model.createBarrier("Mechanical integrity inspection");
	addStack(model, mi, [
		["type", "Active Hardware"],
		["effectiveness", "Good"],
		["criticality", "Very High"],
	]);
	const chain = model.createDegradationChain("Deferred inspection");
	chain.safeguards = [model.createEscalationNode("QA audit of MI backlog")];
	mi.degradationChains = [chain];

	const corrosion = model.createThreat("Corrosion / fatigue of piping");
	corrosion.preventionBarriers = [mi, model.createBarrier("Material selection standards")];

	const impact = model.createThreat("Forklift impact on pipework");
	impact.preventionBarriers = [model.createBarrier("Physical protection & traffic segregation")];

	const maint = model.createThreat("Maintenance isolation error");
	maint.preventionBarriers = [model.createBarrier("Permit-to-work and LOTO")];

	bt.threats = [corrosion, impact, maint];

	const toxic = model.createConsequence("Toxic exposure to personnel");
	const detect = model.createBarrier("Fixed gas detection & alarm");
	addStack(model, detect, [
		["type", "Active Hardware+Human"],
		["status", "Available"],
	]);
	toxic.mitigationBarriers = [detect, model.createBarrier("Emergency ventilation & isolation")];

	const env = model.createConsequence("Environmental release");
	env.mitigationBarriers = [model.createBarrier("Containment sump & dilution")];

	const biz = model.createConsequence("Business interruption");
	biz.mitigationBarriers = [model.createBarrier("Emergency response plan")];

	bt.consequences = [toxic, env, biz];
	return bt;
}

// Minimal scenario that showcases a single barrier's analysis stack + escalation.
function buildBarrierBowtie(model) {
	const bt = model.createBowtie("Barrier analysis");
	bt.events[0].label = "Loss of containment";
	bt.events[0].hazard = "Pressurised ammonia";

	const mi = model.createBarrier("Mechanical integrity inspection");
	addStack(model, mi, [
		["type", "Active Hardware"],
		["effectiveness", "Good"],
		["criticality", "Very High"],
		["responsible", "Tech Department"],
		["validation", "Inspection"],
		["status", "Available"],
	]);
	const chain = model.createDegradationChain("Deferred inspection");
	chain.safeguards = [model.createEscalationNode("QA audit of MI backlog")];
	mi.degradationChains = [chain];

	const threat = model.createThreat("Corrosion / fatigue");
	threat.preventionBarriers = [mi];
	bt.threats = [threat];
	bt.consequences = [model.createConsequence("Toxic release")];
	return bt;
}

function renderNodeHtml(node, barriersById) {
	const wrapStyle = `left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px`;
	const inner = renderNodeInner(node, barriersById);
	return `<div class="o-tie-node-wrap o-tie-node-wrap-${node.kind}" style="${wrapStyle}">${inner}</div>`;
}

function renderNodeInner(node, barriersById) {
	const subtitle = escapeHtml(node.subtitle);
	const label = escapeHtml(node.label);

	if (node.kind === "topEvent") {
		return (
			`<div class="o-tie-node o-tie-node-topEvent">` +
			`<div class="o-tie-node-label o-tie-top-event-label">${label}</div></div>` +
			`<div class="o-tie-top-event-badge">${subtitle}</div>`
		);
	}

	const isBarrier =
		node.kind === "preventionBarrier" ||
		node.kind === "mitigationBarrier" ||
		node.kind === "transitionBarrier";

	if (isBarrier) {
		const barrier = barriersById.get(node.ref.barrierId);
		const headerH = barrierHeaderHeight(barrier);
		let html = `<div class="o-tie-node o-tie-node-${node.kind}">`;
		html += `<div class="o-tie-barrier-header" style="height:${headerH}px;min-height:${headerH}px">`;
		html += `<div class="o-tie-node-stripe">${subtitle}</div>`;
		html += `<div class="o-tie-barrier-header-body"><div class="o-tie-node-label">${label}</div></div>`;
		html += `</div>`;
		const stack = barrier?.stack ?? [];
		if (stack.length > 0 && barrier?.stackCollapsed === false) {
			html += `<div class="o-tie-barrier-stack">`;
			for (const item of stack) {
				const classes = ["o-tie-stack-row"];
				if (item.field) classes.push("o-tie-stack-row-preset");
				const style = [`height:${ROW_H}px`];
				if (item.color) {
					style.push(`background-color:${item.color}`);
					if (isLightStackColor(item.color)) classes.push("o-tie-stack-row-light");
				}
				html += `<div class="${classes.join(" ")}" style="${style.join(";")}">`;
				html += `<div class="o-tie-stack-row-label">${escapeHtml(item.label)}</div></div>`;
			}
			html += `</div>`;
		}
		html += `</div>`;
		return html;
	}

	return (
		`<div class="o-tie-node o-tie-node-${node.kind}">` +
		`<div class="o-tie-node-stripe">${subtitle}</div>` +
		`<div class="o-tie-node-label">${label}</div></div>`
	);
}

function renderEdgesSvg(layout) {
	const size = 8;
	let svg = `<svg class="o-tie-svg" width="${layout.bounds.width}" height="${layout.bounds.height}">`;
	for (const edge of layout.edges) {
		svg += `<path class="o-tie-edge o-tie-edge-${edge.kind}" d="${edge.path}"></path>`;
	}
	for (const edge of layout.edges) {
		const { x, y, angleDeg } = edge.arrow;
		svg += `<g class="o-tie-edge-arrow o-tie-edge-arrow-${edge.kind}" transform="translate(${x} ${y}) rotate(${angleDeg})">`;
		svg += `<path d="M0 0 L-${size} ${-size * 0.42} L-${size} ${size * 0.42} Z"></path></g>`;
	}
	svg += `</svg>`;
	return svg;
}

function pageHtml(layout, barriersById) {
	const nodes = layout.nodes.map((n) => renderNodeHtml(n, barriersById)).join("");
	return `<!doctype html><html><head><meta charset="utf-8"><style>
		${stylesCss}
		html,body{
			margin:0;padding:0;background:#ffffff;
			font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
			-webkit-font-smoothing:antialiased;
		}
		.shot-frame{
			display:inline-block;padding:28px;
			background-color:#ffffff;
			background-image:radial-gradient(circle, #d6dae0 1px, transparent 1px);
			background-size:20px 20px;
		}
		.o-tie-view-root{display:block;height:auto;${THEME_VARS}}
		.o-tie-transform{width:${layout.bounds.width}px;height:${layout.bounds.height}px}
	</style></head><body>
		<div class="shot-frame"><div class="o-tie-view-root"><div class="o-tie-transform">
			${renderEdgesSvg(layout)}
			<div class="o-tie-nodes">${nodes}</div>
		</div></div></div>
	</body></html>`;
}

// Header height calculator captured from the engine at runtime.
let barrierHeaderHeight = () => 52;
let ROW_H = 24;

function indexBarriers(bowtie) {
	const map = new Map();
	const add = (b) => map.set(b.id, b);
	for (const e of bowtie.events) e.transitionBarriers.forEach(add);
	for (const t of bowtie.threats) t.preventionBarriers.forEach(add);
	for (const c of bowtie.consequences) c.mitigationBarriers.forEach(add);
	return map;
}

async function capture(page, engine, bowtie, outFile) {
	const layout = engine.layoutBowtie(bowtie, engine.DEFAULT_LAYOUT);
	ROW_H = engine.DEFAULT_LAYOUT.barrierStackRowHeight;
	barrierHeaderHeight = (barrier) =>
		barrier ? engine.barrierHeaderHeightFor(barrier, engine.DEFAULT_LAYOUT) : engine.DEFAULT_LAYOUT.barrierHeaderHeight;
	const barriersById = indexBarriers(bowtie);
	await page.setContent(pageHtml(layout, barriersById), { waitUntil: "networkidle" });
	const frame = page.locator(".shot-frame");
	await frame.screenshot({ path: outFile });
	console.log(`Wrote ${outFile}`);
}

async function main() {
	mkdirSync(assetsDir, { recursive: true });
	const engine = await loadEngine();
	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: 2 });
	try {
		await capture(page, engine, buildHeroBowtie(engine.model), join(assetsDir, "screenshot-diagram.png"));
		await capture(page, engine, buildBarrierBowtie(engine.model), join(assetsDir, "screenshot-barrier.png"));
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
