import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXAMPLES } from "../src/examples/index.js";
import { renderScene } from "../src/renderer/index.js";
import { parseScene } from "../src/scene/validate.js";

/**
 * Renders every reference scene to examples/out/*.svg plus a contact sheet.
 * Run with `npm run examples`, then open examples/out/index.html.
 */

const outDir = resolve(process.cwd(), "examples/out");
mkdirSync(outDir, { recursive: true });

const cards: string[] = [];

for (const [name, { scene, description }] of Object.entries(EXAMPLES)) {
  const validated = parseScene(scene);
  const svg = renderScene(validated, { pretty: true, idSeed: name });
  writeFileSync(resolve(outDir, `${name}.svg`), svg, "utf8");
  cards.push(
    `<section><h2>${name}</h2><p>${description}</p><div class="frame">${renderScene(validated, { idSeed: `card-${name}` })}</div></section>`,
  );
  console.log(`rendered ${name}.svg (${svg.length} bytes)`);
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Visual MCP examples</title>
<style>
  body { background:#0b0d11; color:#e8eaf0; font: 14px/1.5 system-ui, sans-serif; margin:0; padding:32px; }
  h1 { font-size:22px; } h2 { font-size:16px; margin-bottom:4px; text-transform:uppercase; letter-spacing:.08em; color:#8B5CF6 }
  p { color:#8b93a5; margin-top:0 }
  section { margin-bottom:48px }
  .frame { overflow:auto; border:1px solid #262b36; border-radius:12px; }
  svg { display:block; max-width:100%; height:auto }
</style></head>
<body><h1>Visual MCP - reference scenes</h1>${cards.join("\n")}</body></html>`;

writeFileSync(resolve(outDir, "index.html"), html, "utf8");
console.log(`\nOpen examples/out/index.html`);
