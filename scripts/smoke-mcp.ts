/**
 * End-to-end smoke test against a running HTTP server.
 *
 * It replays the exact conversation from the project brief:
 *   "draw React -> NestJS -> PostgreSQL, and NestJS also uses Redis"
 *   "put Redis above the backend and the database below"
 *   "put all the infrastructure inside a box called AWS"
 *
 * Run:  npm run dev:http    (in one terminal)
 *       npx tsx scripts/smoke-mcp.ts
 */

const URL_BASE = process.env.MCP_URL ?? "http://localhost:3999/mcp";
let nextId = 1;

async function call(method: string, params?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: ")) ?? text;
  const json = JSON.parse(line.replace(/^data: /, ""));
  if (json.error) throw new Error(`${method} failed: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = (await call("tools/call", { name, arguments: args })) as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content?: { text?: string }[];
  };
  const structured = result.structuredContent ?? {};
  const summary = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name} -> ${summary}`);
  console.log(`\n▸ ${name}\n  ${summary.split("\n")[0]!.slice(0, 160)}`);
  return structured;
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main(): Promise<void> {
  await call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "visual-mcp-smoke", version: "1.0.0" },
  });

  const tools = (await call("tools/list")) as { tools: { name: string }[] };
  console.log(`\n▸ tools/list\n  ${tools.tools.map((t) => t.name).join(", ")}`);

  // 1. One call, no coordinates anywhere.
  const created = await tool("render_diagram", {
    title: "Service architecture",
    elements: [
      { id: "frontend", type: "node", label: "React" },
      { id: "backend", type: "node", label: "NestJS" },
      { id: "db", type: "database", label: "PostgreSQL" },
      { id: "cache", type: "database", label: "Redis" },
      { id: "c1", type: "connection", from: "frontend", to: "backend" },
      { id: "c2", type: "connection", from: "backend", to: "db" },
      { id: "c3", type: "connection", from: "backend", to: "cache" },
    ],
  });
  const sceneId = created.sceneId as string;
  assert(typeof sceneId === "string", "render_diagram returned a sceneId");
  assert(String(created.svg).startsWith("<svg"), "render_diagram returned SVG");
  assert(!String(created.svg).includes("<script"), "SVG contains no <script>");

  // 2. The model reads the layout before making a relative change.
  const inspected = await tool("get_scene", { sceneId });
  const layout = inspected.layout as Record<string, { x: number; y: number }>;
  assert(layout.backend !== undefined, "get_scene reported a computed box for 'backend'");
  assert(layout.cache!.x > layout.frontend!.x, "auto-layout put the cache downstream of the frontend");

  // 3. Surgical edits: Redis above the backend, PostgreSQL below it.
  const bx = layout.backend!.x;
  await tool("update_element", { sceneId, elementId: "cache", changes: { x: bx + 260, y: layout.backend!.y - 90 } });
  await tool("update_element", { sceneId, elementId: "db", changes: { x: bx + 260, y: layout.backend!.y + 110 } });

  const after = await tool("get_scene", { sceneId });
  const layout2 = after.layout as Record<string, { x: number; y: number }>;
  assert(layout2.cache!.y < layout2.db!.y, "Redis now sits above PostgreSQL");
  assert((after.scene as { elements: unknown[] }).elements.length === 7, "no elements were lost");

  // 4. Hierarchy edit.
  await tool("group_elements", {
    sceneId,
    groupId: "aws",
    label: "AWS",
    elementIds: ["backend", "db", "cache"],
  });
  const grouped = await tool("get_scene", { sceneId });
  assert((grouped.ids as string[]).includes("aws"), "the AWS group exists");
  assert((grouped.ids as string[]).includes("backend"), "grouped members kept their ids");

  const rendered = await tool("render_scene", { sceneId });
  assert(String(rendered.svg).includes("AWS"), "the rendered SVG shows the AWS boundary");

  // 5. Errors must be actionable, never stack traces.
  const bad = (await call("tools/call", {
    name: "add_element",
    arguments: { sceneId, element: { id: "oops", type: "connection", from: "backend", to: "ghost" } },
  })) as { isError?: boolean; structuredContent?: { error?: { code: string; hint?: string } } };
  assert(bad.isError === true, "a dangling connection is rejected");
  assert(bad.structuredContent?.error?.code === "ELEMENT_NOT_FOUND", "the error carries a machine-readable code");
  assert(Boolean(bad.structuredContent?.error?.hint), "the error carries a hint listing valid ids");

  // 6. The UI resource ChatGPT embeds.
  const resources = (await call("resources/list")) as { resources: { uri: string; mimeType?: string }[] };
  assert(
    resources.resources.some((r) => r.uri === "ui://visual-mcp/scene.html"),
    "the MCP Apps UI resource is advertised",
  );

  console.log("\nAll smoke checks passed.\n");
}

main().catch((err) => {
  console.error("\n✗", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
