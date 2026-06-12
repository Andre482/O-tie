import { addIcon } from "obsidian";

/** Custom icon used for the ribbon, file tabs, and commands. */
export const PLUGIN_ICON = "o-tie-bowtie";

/**
 * Bowtie risk diagram icon (100×100 viewBox per Obsidian addIcon spec).
 *
 * Design based on the industry-standard bowtie method (Wolters Kluwer / ICH):
 * - Centre circle = top event (the "knot")
 * - Left wing  = threats & preventive barriers
 * - Right wing = consequences & mitigating barriers
 *
 * Follows Lucide guidelines scaled to 100: ~8 stroke, round caps/joins, 4px padding.
 * SVG content only — no outer <svg> tag (Obsidian wraps it internally).
 */
const BOWTIE_ICON_SVG = `
<circle cx="50" cy="50" r="10" fill="currentColor" stroke="none"/>
<path d="M50 50 L12 26 L12 74 Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M50 50 L88 26 L88 74 Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M30 50 H38" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
<path d="M62 50 H70" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
`.trim();

let registered = false;

export function registerPluginIcon(): void {
	if (registered) return;
	addIcon(PLUGIN_ICON, BOWTIE_ICON_SVG);
	registered = true;
}

/** Make the ribbon button icon slightly larger than default. */
export function styleRibbonIcon(el: HTMLElement): void {
	el.style.setProperty("--icon-size", "var(--icon-size-l)");
}
