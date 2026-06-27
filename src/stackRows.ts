export const STACK_ROW_COLOR_OPTIONS: { color: string; label: string }[] = [
	{ color: "#5dade2", label: "Sky blue" },
	{ color: "#3498db", label: "Blue" },
	{ color: "#48c9b0", label: "Teal" },
	{ color: "#1abc9c", label: "Mint" },
	{ color: "#7f8c8d", label: "Gray" },
	{ color: "#1e8449", label: "Dark green" },
	{ color: "#27ae60", label: "Green" },
	{ color: "#f1c40f", label: "Yellow" },
	{ color: "#e67e22", label: "Orange" },
	{ color: "#c0392b", label: "Red" },
	{ color: "#2c3e50", label: "Navy" },
	{ color: "#566573", label: "Slate" },
	{ color: "#ffffff", label: "White" },
	{ color: "#f4ecf7", label: "Light purple" },
	{ color: "#eafaf1", label: "Light green" },
];

const LIGHT_STACK_ROW_COLORS = new Set(["#ffffff", "#f4ecf7", "#eafaf1"]);

export function isLightStackColor(color: string): boolean {
	if (LIGHT_STACK_ROW_COLORS.has(color)) return true;
	const match = /^#([0-9a-f]{6})$/i.exec(color);
	if (!match) return false;
	const n = parseInt(match[1], 16);
	const r = (n >> 16) & 0xff;
	const g = (n >> 8) & 0xff;
	const b = n & 0xff;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.62;
}

export function createColorMenuTitle(color: string, label: string): DocumentFragment {
	const frag = activeDocument.createDocumentFragment();
	const wrap = frag.createEl("span", { cls: "o-tie-color-menu-title" });
	const swatch = wrap.createEl("span", { cls: "o-tie-color-swatch" });
	swatch.setCssStyles({ backgroundColor: color });
	if (LIGHT_STACK_ROW_COLORS.has(color)) {
		swatch.addClass("o-tie-color-swatch-light");
	}
	wrap.createEl("span", { cls: "o-tie-color-menu-label", text: label });
	return frag;
}
