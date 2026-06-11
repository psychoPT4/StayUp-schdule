import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const files = ["index.html", "styles.css", "manifest.webmanifest"];
const directories = ["assets", "src"];

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of files) {
  cpSync(join(root, file), join(dist, file));
}

for (const directory of directories) {
  cpSync(join(root, directory), join(dist, directory), { recursive: true });
}
