// Bundles the plugin's pure layout/model TypeScript so Node scripts can use it.
import { build } from "esbuild";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, "..");

export async function loadEngine() {
	const result = await build({
		stdin: {
			contents: `
				export { layoutBowtie, DEFAULT_LAYOUT, barrierHeaderHeightFor } from "./src/layout";
				export * as model from "./src/model";
			`,
			resolveDir: root,
			loader: "ts",
			sourcefile: "engine-entry.ts",
		},
		bundle: true,
		format: "esm",
		platform: "node",
		write: false,
		logLevel: "silent",
	});
	const tmp = join(scriptsDir, `_engine-${process.pid}.mjs`);
	writeFileSync(tmp, result.outputFiles[0].text);
	try {
		return await import(pathToFileURL(tmp).href);
	} finally {
		rmSync(tmp, { force: true });
	}
}
