import { toBlob } from "html-to-image";

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
	for (let i = 0; i < styles.length; i++) {
		const name = styles[i];
		if (
			name.startsWith("--o-tie") ||
			name.startsWith("--font") ||
			name.startsWith("--interactive") ||
			name.startsWith("--radius")
		) {
			to.style.setProperty(name, styles.getPropertyValue(name));
		}
	}

	// Node cards always use light pastel fills — keep export text readable in dark mode.
	to.style.setProperty("--text-normal", "#1a1a1a");
	to.style.setProperty("--text-muted", "#5d6d7e");
	to.style.setProperty("--background-primary", "#ffffff");
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
	const layer = document.createElement("div");
	layer.className = "o-tie-export-layer";
	layer.style.position = "relative";
	layer.style.width = `${bounds.width}px`;
	layer.style.height = `${bounds.height}px`;
	layer.style.overflow = "visible";

	const edgeImg = document.createElement("img");
	edgeImg.className = "o-tie-export-edges";
	edgeImg.alt = "";
	edgeImg.src = svgToDataUrl(svgEl);
	edgeImg.width = bounds.width;
	edgeImg.height = bounds.height;
	edgeImg.style.position = "absolute";
	edgeImg.style.top = "0";
	edgeImg.style.left = "0";
	edgeImg.style.width = `${bounds.width}px`;
	edgeImg.style.height = `${bounds.height}px`;
	edgeImg.style.pointerEvents = "none";
	layer.appendChild(edgeImg);

	const nodesClone = nodesEl.cloneNode(true) as HTMLElement;
	prepareExportClone(nodesClone);
	nodesClone.style.position = "absolute";
	nodesClone.style.top = "0";
	nodesClone.style.left = "0";
	nodesClone.style.width = `${bounds.width}px`;
	nodesClone.style.height = `${bounds.height}px`;
	nodesClone.style.overflow = "visible";
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
	const wrapper = document.createElement("div");
	wrapper.style.cssText =
		"position:fixed;left:-20000px;top:0;pointer-events:none;z-index:-1;";

	const root = document.createElement("div");
	root.className = "o-tie-view-root o-tie-export-root";
	root.style.position = "relative";
	root.style.left = "0";
	root.style.top = "0";
	root.style.overflow = "hidden";
	root.style.opacity = "1";
	root.style.visibility = "visible";
	root.style.width = `${exportWidth}px`;
	root.style.height = `${exportHeight}px`;
	copyThemeVariables(viewRootEl, root);

	const bgStyles = getComputedStyle(viewRootEl);
	const dotColor =
		bgStyles.getPropertyValue("--background-modifier-border").trim() || "#d0d0d0";
	root.style.backgroundColor = backgroundColor;
	if (showGrid) {
		root.style.backgroundImage = buildGridBackground(backgroundColor, dotColor);
		root.style.backgroundSize = `${GRID_SIZE}px ${GRID_SIZE}px`;
		root.style.backgroundPosition = `${EXPORT_PADDING}px ${EXPORT_PADDING}px`;
	}

	const stage = document.createElement("div");
	stage.className = "o-tie-export-stage";
	stage.style.position = "absolute";
	stage.style.width = `${bounds.width}px`;
	stage.style.height = `${bounds.height}px`;
	stage.style.left = `${EXPORT_PADDING - (crop?.x ?? 0)}px`;
	stage.style.top = `${EXPORT_PADDING - (crop?.y ?? 0)}px`;
	stage.style.overflow = "visible";

	stage.appendChild(buildDiagramLayer(svgEl, nodesEl, bounds));
	root.appendChild(stage);
	wrapper.appendChild(root);
	document.body.appendChild(wrapper);

	try {
		await document.fonts.ready;
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
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename.endsWith(".png") ? filename : `${filename}.png`;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function sanitizeExportFilename(name: string): string {
	const trimmed = name.trim() || "bowtie";
	return trimmed.replace(/[\\/:*?"<>|]/g, "-");
}
