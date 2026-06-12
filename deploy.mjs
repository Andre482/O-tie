import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const files = ["main.js", "styles.css", "manifest.json"];
const vaults = [
	"C:/Users/User/OneDrive/Obsidian/Andre482/.obsidian/plugins/o-tie",
	"C:/Users/User/OneDrive/Obsidian/.obsidian/plugins/o-tie",
	"C:/Users/User/OneDrive/Obsidian/Bowties/.obsidian/plugins/o-tie",
];

for (const vault of vaults) {
	if (!existsSync(vault)) {
		mkdirSync(vault, { recursive: true });
	}
	for (const file of files) {
		copyFileSync(join(process.cwd(), file), join(vault, file));
	}
	console.log(`Deployed to ${vault}`);
}
