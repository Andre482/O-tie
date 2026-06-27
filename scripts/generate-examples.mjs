// Regenerates the committed example .bowtie files in the current schema.
//
// Authoring the scenarios through the real model guarantees the files validate
// and stay in canonical form. Run:  npm run examples

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine } from "./engine.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(scriptsDir, "..", "examples");
const FIXED_TS = "2026-06-12T00:00:00.000Z";

const engine = await loadEngine();
const model = engine.model;

function fieldColor(fieldKey, label) {
	const field = model.BARRIER_STACK_FIELDS.find((f) => f.key === fieldKey);
	return field?.options.find((o) => o.label === label)?.color;
}

function barrier(label, opts = {}) {
	const b = model.createBarrier(label);
	if (opts.notes) b.notes = opts.notes;
	if (opts.stack) {
		b.stack = opts.stack.map(([field, value]) => {
			const color = fieldColor(field, value);
			if (color === undefined) throw new Error(`Unknown ${field} option: ${value}`);
			return model.createBarrierStackItem(value, field, color);
		});
		model.sortBarrierStack(b.stack);
		b.stackCollapsed = opts.expanded !== true;
	}
	if (opts.chains) {
		b.degradationChains = opts.chains.map((c) => {
			const chain = model.createDegradationChain(c.factor);
			chain.safeguards = (c.safeguards ?? []).map((s) => model.createEscalationNode(s));
			return chain;
		});
	}
	return b;
}

function threat(label, notes, barriers) {
	const t = model.createThreat(label);
	if (notes) t.notes = notes;
	t.preventionBarriers = barriers;
	return t;
}

function consequence(label, notes, barriers) {
	const c = model.createConsequence(label);
	if (notes) c.notes = notes;
	c.mitigationBarriers = barriers;
	return c;
}

// Stable, readable ids so regeneration produces minimal diffs.
function reassignIds(bowtie) {
	let n = 0;
	const id = (prefix) => `${prefix}-${n++}`;
	bowtie.id = id("bowtie");
	for (const event of bowtie.events) {
		event.id = id("event");
		event.transitionBarriers.forEach(reassignBarrier(id));
	}
	for (const t of bowtie.threats) {
		t.id = id("threat");
		t.preventionBarriers.forEach(reassignBarrier(id));
	}
	for (const c of bowtie.consequences) {
		c.id = id("consequence");
		c.mitigationBarriers.forEach(reassignBarrier(id));
	}
	bowtie.createdAt = FIXED_TS;
	bowtie.updatedAt = FIXED_TS;
	return bowtie;

	function reassignBarrier(idFn) {
		return (b) => {
			b.id = idFn("barrier");
			for (const item of b.stack ?? []) item.id = idFn("stack");
			for (const chain of b.degradationChains) {
				chain.id = idFn("chain");
				for (const sg of chain.safeguards) sg.id = idFn("safeguard");
				chain.degradationFactor.id = idFn("degradation");
			}
		};
	}
}

function buildAmmonia() {
	const bt = model.createBowtie("Cold storage ammonia refrigeration");
	bt.events[0].label = "Loss of primary containment from ammonia refrigeration circuit";
	bt.events[0].hazard = "Pressurised anhydrous ammonia (NH3) refrigeration inventory";

	bt.threats = [
		threat(
			"Corrosion or fatigue of piping, vessels, or evaporator coils",
			"Credible in aged plant with cyclic thermal loading, condensate, or corrosion under insulation.",
			[
				barrier("Mechanical integrity inspection program", {
					notes: "NDT, thickness monitoring, and replacement intervals per IIAR-6 / company standards.",
					expanded: true,
					stack: [
						["type", "Active Hardware"],
						["effectiveness", "Good"],
						["criticality", "Very High"],
						["responsible", "Tech Department"],
						["validation", "Inspection"],
						["status", "Available"],
					],
					chains: [
						{
							factor: "Deferred inspection due to production pressure",
							safeguards: ["QA audit of mechanical integrity backlog"],
						},
					],
				}),
				barrier("Materials of construction and corrosion allowance", {
					notes: "Compatible metallurgy, coatings, and design margin for operating conditions.",
					stack: [
						["type", "Passive Hardware"],
						["effectiveness", "Good"],
						["criticality", "High"],
						["status", "Available"],
					],
				}),
			]
		),
		threat(
			"Forklift or vehicle impact on exposed ammonia piping",
			"Common in warehouse aisles adjacent to machine rooms or overhead pipe runs.",
			[
				barrier("Physical protection and traffic segregation", {
					notes: "Bollards, rack guards, marked routes, and restricted machine-room access.",
					stack: [
						["type", "Passive Hardware"],
						["effectiveness", "Good"],
						["criticality", "High"],
						["status", "Available"],
					],
					chains: [
						{
							factor: "Bollards removed or bypassed for convenience",
							safeguards: ["Supervisor housekeeping and barrier inspection rounds"],
						},
					],
				}),
			]
		),
		threat("Overpressure in low-side or high-side refrigeration circuit", undefined, [
			barrier("Pressure relief devices and high-pressure interlocks", {
				notes: "PSVs discharge to a safe location; alarm and trip on abnormal pressure.",
				stack: [
					["type", "Active Hardware"],
					["effectiveness", "Good"],
					["criticality", "Very High"],
					["status", "Available"],
				],
				chains: [
					{
						factor: "Relief device isolated, blocked, or inspection overdue",
						safeguards: ["PSV inspection and register management program"],
					},
				],
			}),
		]),
		threat("Maintenance isolation or re-commissioning error", undefined, [
			barrier("Permit-to-work and LOTO procedures", {
				notes: "Verified isolation, zero-energy confirmation, and ammonia-specific competency.",
				stack: [
					["type", "Active Human"],
					["effectiveness", "Good"],
					["criticality", "Very High"],
					["status", "Available"],
				],
				chains: [
					{
						factor: "Technician competency not verified for ammonia work",
						safeguards: ["Competency assessment and authorization records"],
					},
				],
			}),
		]),
		threat("Operator error during startup, shutdown, or abnormal operation", undefined, [
			barrier("Operating procedures and abnormal situation guidance", {
				notes: "Written procedures for charge management, alarms, and emergency slowdown.",
				stack: [
					["type", "Active Human"],
					["effectiveness", "Good"],
					["criticality", "High"],
					["status", "Available"],
				],
			}),
			barrier("Operator training and competency assurance", {
				notes: "Refresher training on ammonia properties, alarms, and first actions.",
				stack: [
					["type", "Active Human"],
					["effectiveness", "Fair"],
					["criticality", "Medium"],
					["status", "Available"],
				],
			}),
		]),
	];

	bt.consequences = [
		consequence("Personnel harm due to toxic ammonia exposure", undefined, [
			barrier("Fixed ammonia gas detection and alarm", {
				notes: "Audible/visual alarm, with potential automatic isolation or ventilation actuation.",
				expanded: true,
				stack: [
					["type", "Active Hardware"],
					["effectiveness", "Good"],
					["criticality", "Very High"],
					["responsible", "HSE Department"],
					["validation", "Barrier Test"],
					["status", "Available"],
				],
				chains: [
					{
						factor: "Sensor calibration overdue or drift",
						safeguards: ["Calibration management and functional test program"],
					},
				],
			}),
			barrier("Emergency ventilation and isolation valves", {
				notes: "Reduce airborne concentration; close isolation valves where safe to do so.",
				stack: [
					["type", "Active Hardware"],
					["effectiveness", "Good"],
					["criticality", "Very High"],
					["status", "Available"],
				],
			}),
		]),
		consequence("Environmental damage due to ammonia release", undefined, [
			barrier("Containment sump and emergency dilution / knock-down", {
				notes: "Limit spread to drains, waterways, or off-site receptors.",
				stack: [
					["type", "Passive Hardware"],
					["effectiveness", "Fair"],
					["criticality", "High"],
					["status", "Degraded"],
				],
			}),
		]),
		consequence("Operational loss due to cold-chain interruption", undefined, [
			barrier("Emergency response plan and qualified contractor standby", {
				notes: "Ammonia-qualified emergency repair and product salvage / transfer plan.",
				stack: [
					["type", "Active Human"],
					["effectiveness", "Good"],
					["criticality", "High"],
					["responsible", "Management"],
					["status", "Available"],
				],
				chains: [
					{
						factor: "Contractor availability or response time not assured",
						safeguards: ["Pre-qualified contractor agreement and annual drill"],
					},
				],
			}),
		]),
	];

	return reassignIds(bt);
}

function buildSteamcracker() {
	const bt = model.createBowtie("Defective steamcracker");
	bt.events[0].label = "Loss of containment in steamcracker furnace";
	bt.events[0].hazard = "High-pressure ethylene cracking system";

	bt.threats = [
		threat("Tube corrosion / fatigue", undefined, [
			barrier("Periodic tube inspection program"),
			barrier("Material selection standards"),
		]),
		threat("Operator error during startup", undefined, [
			barrier("Standard operating procedures"),
		]),
	];
	bt.consequences = [
		consequence("Fire / explosion", undefined, [
			barrier("Deluge and fire suppression systems"),
		]),
		consequence("Toxic gas release", undefined, [
			barrier("Gas detection and isolation"),
			barrier("Emergency response plan"),
		]),
	];

	return reassignIds(bt);
}

function write(name, bowtie) {
	const file = join(examplesDir, name);
	writeFileSync(file, `${model.serializeBowtie(bowtie)}\n`);
	console.log(`Wrote ${file}`);
}

write("cold-storage-ammonia.bowtie", buildAmmonia());
write("steamcracker.bowtie", buildSteamcracker());
