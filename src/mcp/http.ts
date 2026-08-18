import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { renderScene } from "../renderer/index.js";
import { InMemorySceneStore } from "../scene/sceneStore.js";
import { EXAMPLES } from "../examples/index.js";
import { createVisualMcpServer } from "./server.js";
import { WIDGET_HTML } from "./widget.js";

/**
 * Streamable HTTP transport at POST /mcp - the transport ChatGPT uses for
 * remote MCP connectors.
 *
 * The server runs STATELESS: every request gets a fresh McpServer and
 * transport, and the SceneStore is the only shared state. That is what makes it
 * safe to put behind a load balancer or on a serverless platform, where two
 * turns of the same conversation may not hit the same process.
 */

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "0.0.0.0";
/** Set in production, e.g. https://visual-mcp.example.com */
const PUBLIC_URL = process.env.PUBLIC_URL ?? "";
const INLINE_SVG = process.env.VISUAL_MCP_INLINE_SVG !== "0";
/** Comma-separated hosts allowed by DNS-rebinding protection. */
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);

const store = new InMemorySceneStore();

// Pre-load the reference scenes so /scenes/example-network.svg works immediately.
for (const { scene } of Object.values(EXAMPLES)) store.create(scene);

const app = express();
app.use(express.json({ limit: "8mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

async function handleMcp(req: Request, res: Response): Promise<void> {
  const server = createVisualMcpServer({
    store,
    ...(PUBLIC_URL ? { publicUrl: PUBLIC_URL } : {}),
    inlineSvg: INLINE_SVG,
  });
  const transport = new StreamableHTTPServerTransport({
    // Stateless: no session ids, no per-connection state to lose.
    sessionIdGenerator: undefined,
    ...(ALLOWED_HOSTS.length
      ? { enableDnsRebindingProtection: true, allowedHosts: ALLOWED_HOSTS }
      : {}),
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("visual-mcp: request failed", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

app.post("/mcp", (req, res) => void handleMcp(req, res));

// Stateless mode has no server-initiated stream to resume or terminate.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "This server is stateless: use POST /mcp." },
    id: null,
  });
});
app.delete("/mcp", (_req, res) => res.sendStatus(405));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "visual-mcp", scenes: store.list().length });
});

/** Direct SVG access, so a rendered scene has a stable URL. */
app.get("/scenes/:id.svg", (req, res) => {
  const id = String(req.params.id).replace(/\.svg$/, "");
  const scene = store.get(id);
  if (!scene) {
    res.status(404).type("text/plain").send(`No scene '${id}'.`);
    return;
  }
  res
    .type("image/svg+xml")
    .setHeader("Cache-Control", "no-store")
    .send(renderScene(scene, { idSeed: id }));
});

app.get("/scenes", (_req, res) => res.json({ scenes: store.list() }));

/** The same viewer ChatGPT embeds, usable standalone: /viewer?svg=/scenes/<id>.svg */
app.get("/viewer", (_req, res) => res.type("text/html").send(WIDGET_HTML));

app.get("/", (_req, res) => {
  res.type("text/plain").send(
    [
      "visual-mcp",
      "",
      "  POST /mcp             MCP Streamable HTTP endpoint",
      "  GET  /health          health check",
      "  GET  /scenes          list stored scenes",
      "  GET  /scenes/:id.svg  rendered scene",
      "  GET  /viewer?svg=...  interactive viewer",
      "",
      `Examples: ${Object.values(EXAMPLES).map((e) => `/scenes/${e.scene.id}.svg`).join("  ")}`,
    ].join("\n"),
  );
});

app.listen(PORT, HOST, () => {
  console.log(`visual-mcp: MCP endpoint on http://localhost:${PORT}/mcp`);
  console.log(`visual-mcp: viewer on http://localhost:${PORT}/viewer?svg=/scenes/example-network.svg`);
  if (!PUBLIC_URL) console.log("visual-mcp: set PUBLIC_URL to include svgUrl in tool results");
});
