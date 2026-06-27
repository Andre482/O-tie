import type { BowtieViewState } from "./model";

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export const FIT_MAX_ZOOM = 1.2;

export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
	return Math.min(max, Math.max(min, zoom));
}

/** Normalize a wheel delta to pixels regardless of the browser's delta mode. */
export function normalizeWheelDelta(
	deltaY: number,
	deltaMode: number,
	lineHeight: number,
	pageHeight: number
): number {
	if (deltaMode === WheelEvent.DOM_DELTA_LINE) return deltaY * lineHeight;
	if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return deltaY * pageHeight;
	return deltaY;
}

/** Gentle zoom factor: ~5% per wheel notch, smoother for trackpad pinch (ctrl). */
export function wheelFactorFromDelta(deltaY: number, ctrlKey: boolean): number {
	const sensitivity = ctrlKey ? 0.0012 : 0.00045;
	const factor = Math.exp(-deltaY * sensitivity);
	const maxStep = ctrlKey ? 1.08 : 1.06;
	const minStep = 1 / maxStep;
	return Math.max(minStep, Math.min(maxStep, factor));
}

/**
 * Zoom toward a point (in container-local coordinates) by a factor, keeping the
 * world point under the cursor stable. Returns null when the zoom is unchanged.
 */
export function computeZoomAt(
	view: BowtieViewState,
	localX: number,
	localY: number,
	factor: number
): BowtieViewState | null {
	const oldZoom = view.zoom;
	const newZoom = clampZoom(oldZoom * factor);
	if (newZoom === oldZoom) return null;

	const worldX = (localX - view.panX) / oldZoom;
	const worldY = (localY - view.panY) / oldZoom;
	return {
		zoom: newZoom,
		panX: localX - worldX * newZoom,
		panY: localY - worldY * newZoom,
	};
}

/** Center and scale a diagram of the given bounds inside a viewport rectangle. */
export function computeFit(
	boundsWidth: number,
	boundsHeight: number,
	rectWidth: number,
	rectHeight: number,
	padding: number
): BowtieViewState {
	const scaleX = (rectWidth - padding * 2) / boundsWidth;
	const scaleY = (rectHeight - padding * 2) / boundsHeight;
	const scale = Math.min(scaleX, scaleY);
	// Fit must be allowed to zoom out below MIN_ZOOM so large diagrams fit entirely.
	const zoom = Math.min(FIT_MAX_ZOOM, Math.max(0.01, scale));
	return {
		zoom,
		panX: (rectWidth - boundsWidth * zoom) / 2,
		panY: (rectHeight - boundsHeight * zoom) / 2,
	};
}
