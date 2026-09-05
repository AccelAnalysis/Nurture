import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = ["nurture-n-glass.png", "nurture-n-mono.svg"];

for (const asset of assets) {
  const source = resolve(repoRoot, "brand", "logo", asset);
  const destination = resolve(repoRoot, "public", "brand", "logo", asset);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(`Synced ${assets.length} canonical Nurture brand assets.`);
