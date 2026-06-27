import { describe, expect, it } from "vitest";
import {
	clampZoom,
	computeFit,
	computeZoomAt,
	MAX_ZOOM,
	MIN_ZOOM,
	wheelFactorFromDelta,
} from "../src/panZoom";

describe("clampZoom", () => {
	it("clamps to the configured range", () => {
		expect(clampZoom(0.01)).toBe(MIN_ZOOM);
		expect(clampZoom(99)).toBe(MAX_ZOOM);
		expect(clampZoom(1)).toBe(1);
	});
});

describe("wheelFactorFromDelta", () => {
	it("zooms in for negative delta and out for positive delta", () => {
		expect(wheelFactorFromDelta(-100, false)).toBeGreaterThan(1);
		expect(wheelFactorFromDelta(100, false)).toBeLessThan(1);
	});

	it("caps the per-notch step", () => {
		expect(wheelFactorFromDelta(-100000, false)).toBeLessThanOrEqual(1.06);
		expect(wheelFactorFromDelta(100000, true)).toBeGreaterThanOrEqual(1 / 1.08);
	});
});

describe("computeZoomAt", () => {
	it("keeps the point under the cursor fixed", () => {
		const view = { zoom: 1, panX: 0, panY: 0 };
		const next = computeZoomAt(view, 200, 100, 2)!;
		expect(next.zoom).toBe(2);
		// World point under (200,100) before zoom: (200,100). After zoom it must map back to (200,100).
		const worldX = (200 - next.panX) / next.zoom;
		const worldY = (100 - next.panY) / next.zoom;
		expect(worldX).toBeCloseTo(200, 5);
		expect(worldY).toBeCloseTo(100, 5);
	});

	it("returns null when clamped zoom does not change", () => {
		const view = { zoom: MAX_ZOOM, panX: 0, panY: 0 };
		expect(computeZoomAt(view, 0, 0, 2)).toBeNull();
	});
});

describe("computeFit", () => {
	it("centers the diagram within the viewport", () => {
		const fit = computeFit(400, 200, 1000, 600, 40);
		expect(fit.zoom).toBeGreaterThan(0);
		const renderedW = 400 * fit.zoom;
		const renderedH = 200 * fit.zoom;
		expect(fit.panX).toBeCloseTo((1000 - renderedW) / 2, 5);
		expect(fit.panY).toBeCloseTo((600 - renderedH) / 2, 5);
	});
});
