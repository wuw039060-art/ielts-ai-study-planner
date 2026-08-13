import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const clientDir = resolve("dist/client");
const source = await readFile(resolve(clientDir, "index.html"), "utf8");
const scriptMatch = source.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
const styleMatch = source.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);

if (!scriptMatch || !styleMatch) {
  throw new Error("Could not locate the emitted script and stylesheet.");
}

const scriptPath = resolve(clientDir, scriptMatch[1]);
const stylePath = resolve(clientDir, styleMatch[1]);
const [script, style] = await Promise.all([
  readFile(scriptPath, "utf8"),
  readFile(stylePath, "utf8"),
]);

const standalone = source
  .replace(
    styleMatch[0],
    () => `<style>${style.replaceAll("</style", "<\\/style")}</style>`,
  )
  .replace(
    scriptMatch[0],
    () => `<script type="module">${script.replaceAll("</script", "<\\/script")}</script>`,
  );

await unlink(resolve("dist/IELTS8-个人行动手册.html")).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
await unlink(resolve("dist/IELTS8-进阶手册.html")).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
await writeFile(resolve("dist/雅思学习手册.html"), standalone, "utf8");
console.log("Prepared standalone preview: dist/雅思学习手册.html");
