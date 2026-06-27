import { toBlob } from "html-to-image";
import { sanitizeBaseName } from "./model";

export type BowtieExportArea = "full" | "viewport";

export interface BowtieExportViewport {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface BowtieExportOptions {
	svgEl: SVGSVGElement;
	nodesEl: HTMLElement;
	viewRootEl: HTMLElement;
	bounds: { width: number; height: number };
	area: BowtieExportArea;
	scale: number;
	showGrid: boolean;
	viewport?: BowtieExportViewport;
	backgroundColor: string;
}

const EXPORT_PADDING = 24;
const MAX_EXPORT_DIMENSION = 16384;
const GRID_SIZE = 20;

const EXPORT_CHROME_SELECTORS = [
	".o-tie-node-delete",
	".o-tie-node-add-barrier",
	".o-tie-node-add-escalation",
	".o-tie-node-add-esc-barrier",
	".o-tie-stack-add",
	".o-tie-stack-chevron",
	".o-tie-lane-add",
	"button",
].join(", ");

function copyThemeVariables(from: HTMLElement, to: HTMLElement): void {
	const styles = getComputedStyle(from);
	const props: Record<string, string> = {};
	for (let i = 0; i < styles.length; i++) {
		const name = styles[i];
		if (
			name.startsWith("--o-tie") ||
			name.startsWith("--font") ||
			name.startsWith("--interactive") ||
			name.startsWith("--radius")
		) {
			props[name] = styles.getPropertyValue(name);
		}
	}

	// Node cards always use light pastel fills — keep export text readable in dark mode.
	props["--text-normal"] = "#1a1a1a";
	props["--text-muted"] = "#5d6d7e";
	props["--background-primary"] = "#ffffff";
	to.setCssProps(props);
}

function prepareExportClone(clone: HTMLElement): void {
	clone.querySelectorAll(EXPORT_CHROME_SELECTORS).forEach((el) => el.remove());
	clone.querySelectorAll(".o-tie-node-selected").forEach((el) => {
		el.removeClass("o-tie-node-selected");
	});
	clone.querySelectorAll(".o-tie-stack-empty").forEach((el) => el.remove());
}

function buildGridBackground(color: string, dotColor: string): string {
	return `radial-gradient(circle, ${dotColor} 1px, transparent 1px), ${color}`;
}

function resolveSvgStyles(svg: SVGSVGElement): SVGSVGElement {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	const sourceEls = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
	const cloneEls = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];

	const shapeTags = new Set([
		"path",
		"line",
		"polyline",
		"polygon",
		"rect",
		"circle",
		"ellipse",
	]);

	for (let i = 0; i < sourceEls.length && i < cloneEls.length; i++) {
		const el = cloneEls[i];
		if (!shapeTags.has(el.tagName.toLowerCase())) continue;

		const computed = getComputedStyle(sourceEls[i]);
		const stroke = computed.stroke;
		const fill = computed.fill;
		const strokeWidth = computed.strokeWidth;
		const strokeDasharray = computed.strokeDasharray;
		const strokeLinecap = computed.strokeLinecap;
		const strokeLinejoin = computed.strokeLinejoin;

		// Always write fill/stroke explicitly: the standalone export SVG has no
		// stylesheet, so unset shapes would default to fill:black (filled blobs).
		el.setAttribute("fill", fill || "none");
		el.setAttribute("stroke", stroke || "none");
		if (strokeWidth) el.setAttribute("stroke-width", strokeWidth);
		if (strokeDasharray && strokeDasharray !== "none") {
			el.setAttribute("stroke-dasharray", strokeDasharray);
		}
		if (strokeLinecap) el.setAttribute("stroke-linecap", strokeLinecap);
		if (strokeLinejoin) el.setAttribute("stroke-linejoin", strokeLinejoin);
	}

	clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	return clone;
}

function svgToDataUrl(svg: SVGSVGElement): string {
	const resolved = resolveSvgStyles(svg);
	const serialized = new XMLSerializer().serializeToString(resolved);
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
}

function buildDiagramLayer(
	svgEl: SVGSVGElement,
	nodesEl: HTMLElement,
	bounds: { width: number; height: number }
): HTMLElement {
	const layer = activeDocument.createElement("div");
	layer.className = "o-tie-export-layer";
	layer.setCssStyles({
		width: `${bounds.width}px`,
		height: `${bounds.height}px`,
	});

	const edgeImg = activeDocument.createElement("img");
	edgeImg.className = "o-tie-export-edges";
	edgeImg.alt = "";
	edgeImg.src = svgToDataUrl(svgEl);
	edgeImg.width = bounds.width;
	edgeImg.height = bounds.height;
	edgeImg.setCssStyles({
		width: `${bounds.width}px`,
		height: `${bounds.height}px`,
	});
	layer.appendChild(edgeImg);

	const nodesClone = nodesEl.cloneNode(true) as HTMLElement;
	prepareExportClone(nodesClone);
	nodesClone.classList.add("o-tie-export-nodes");
	nodesClone.setCssStyles({
		width: `${bounds.width}px`,
		height: `${bounds.height}px`,
	});
	layer.appendChild(nodesClone);

	return layer;
}

async function domToPng(
	element: HTMLElement,
	width: number,
	height: number,
	scale: number,
	backgroundColor: string
): Promise<Blob> {
	const outW = Math.min(Math.round(width * scale), MAX_EXPORT_DIMENSION);
	const outH = Math.min(Math.round(height * scale), MAX_EXPORT_DIMENSION);
	if (outW <= 0 || outH <= 0) {
		throw new Error("Export dimensions are too small.");
	}

	const blob = await toBlob(element, {
		width,
		height,
		pixelRatio: scale,
		cacheBust: true,
		skipAutoScale: true,
		includeQueryParams: false,
		backgroundColor,
		style: {
			margin: "0",
			padding: "0",
			left: "0",
			top: "0",
			position: "relative",
			transform: "none",
			opacity: "1",
			visibility: "visible",
		},
	});

	if (!blob) {
		throw new Error("PNG export failed.");
	}

	return blob;
}

export async function rasterizeBowtieForExport(options: BowtieExportOptions): Promise<Blob> {
	const { svgEl, nodesEl, viewRootEl, bounds, area, scale, showGrid, viewport, backgroundColor } =
		options;

	const crop = area === "viewport" ? viewport : undefined;
	const contentWidth = crop ? crop.width : bounds.width;
	const contentHeight = crop ? crop.height : bounds.height;
	const exportWidth = contentWidth + EXPORT_PADDING * 2;
	const exportHeight = contentHeight + EXPORT_PADDING * 2;

	// Offscreen wrapper carries the positioning offset so it is NOT inlined
	// onto the captured element (which would push content out of the frame).
	const wrapper = activeDocument.createElement("div");
	wrapper.className = "o-tie-export-wrapper";

	const root = activeDocument.createElement("div");
	root.className = "o-tie-view-root o-tie-export-root";
	root.setCssStyles({
		width: `${exportWidth}px`,
		height: `${exportHeight}px`,
	});
	copyThemeVariables(viewRootEl, root);

	const bgStyles = getComputedStyle(viewRootEl);
	const dotColor =
		bgStyles.getPropertyValue("--background-modifier-border").trim() || "#d0d0d0";
	const rootBg: Partial<CSSStyleDeclaration> = { backgroundColor };
	if (showGrid) {
		rootBg.backgroundImage = buildGridBackground(backgroundColor, dotColor);
		rootBg.backgroundSize = `${GRID_SIZE}px ${GRID_SIZE}px`;
		rootBg.backgroundPosition = `${EXPORT_PADDING}px ${EXPORT_PADDING}px`;
	}
	root.setCssStyles(rootBg);

	const stage = activeDocument.createElement("div");
	stage.className = "o-tie-export-stage";
	stage.setCssStyles({
		width: `${bounds.width}px`,
		height: `${bounds.height}px`,
		left: `${EXPORT_PADDING - (crop?.x ?? 0)}px`,
		top: `${EXPORT_PADDING - (crop?.y ?? 0)}px`,
	});
	stage.appendChild(buildDiagramLayer(svgEl, nodesEl, bounds));
	root.appendChild(stage);
	wrapper.appendChild(root);
	activeDocument.body.appendChild(wrapper);

	try {
		await activeDocument.fonts.ready;
		await Promise.all(
			Array.from(root.querySelectorAll<HTMLImageElement>("img.o-tie-export-edges")).map(
				(img) => {
					if (img.complete) return Promise.resolve();
					return new Promise<void>((resolve, reject) => {
						img.onload = () => resolve();
						img.onerror = () => reject(new Error("Failed to render diagram edges."));
					});
				}
			)
		);
		return await domToPng(root, exportWidth, exportHeight, scale, backgroundColor);
	} finally {
		wrapper.remove();
	}
}

export function downloadPng(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = activeDocument.createElement("a");
	anchor.href = url;
	anchor.download = filename.endsWith(".png") ? filename : `${filename}.png`;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function sanitizeExportFilename(name: string): string {
	return sanitizeBaseName(name);
}
