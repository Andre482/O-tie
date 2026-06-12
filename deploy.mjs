import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const files = ["main.js", "styles.css", "manifest.json"];
const target = process.env.OBSIDIAN_PLUGIN_DIR;

if (!target) {
	console.error(
		"Set OBSIDIAN_PLUGIN_DIR to your plugin folder, e.g.\n" +
			'  OBSIDIAN_PLUGIN_DIR="C:/path/to/vault/.obsidian/plugins/o-tie" npm run deploy'
	);
	process.exit(1);
}

if (!existsSync(target)) {
	mkdirSync(target, { recursive: true });
}

for (const file of files) {
	copyFileSync(join(process.cwd(), file), join(target, file));
}

console.log(`Deployed to ${target}`);
