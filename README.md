# Visual MCP

A Model Context Protocol server that gives an LLM a **structured visual layer**: it describes
*what exists* and gets back a clean, precise SVG diagram — instead of ASCII art.

---

## What is Visual MCP?

Ask any LLM to "draw the architecture" and you get this:

```text
+----------+      +---------+      +------------+
|  React   |----->| NestJS  |----->| PostgreSQL |
+----------+      +---------+      +------------+
                       |
                       +-----> Redis?
```

Box-drawing characters are a bad medium for spatial information. Alignment breaks, arrows do not
reach, nothing can be edited afterwards, and the model burns reasoning on character counting.

The obvious fix — "let the model write SVG" — is worse. Then it has to compute viewBoxes, path
data, arrowhead polygons, text baselines and border intersections, all by hand, all without
feedback, and all again from scratch the moment the user asks for one small change.

**Visual MCP removes the geometry from the model's job.** The model works with a *scene graph*:

```json
{
  "title": "Service architecture",
  "elements": [
    { "id": "frontend", "type": "node",     "label": "React" },
    { "id": "backend",  "type": "node",     "label": "NestJS" },
    { "id": "db",       "type": "database", "label": "PostgreSQL" },
    { "id": "cache",    "type": "database", "label": "Redis" },

    { "id": "c1", "type": "connection", "from": "frontend", "to": "backend" },
    { "id": "c2", "type": "connection", "from": "backend",  "to": "db" },
    { "id": "c3", "type": "connection", "from": "backend",  "to": "cache" }
  ]
}
```

Note what is *not* there: no coordinates, no sizes, no line endpoints, no arrowheads, no SVG.
The server computes all of it — node sizes from the labels, positions from the connection graph,
edges that meet the borders, arrowhead markers, text wrapping, and a viewBox that cannot clip.

And because the scene is a graph with stable ids, the next turn of the conversation is a one-line
edit rather than a redraw:

> "Put Redis above the backend and PostgreSQL below it."
> → `update_element` × 2, everything else untouched.

> "Now put all the infrastructure inside a box called AWS."
> → `group_elements`, and nothing moves.

---

## Architecture

```text
ChatGPT
   │  tool call: render_diagram / update_element / …
   ▼
MCP server            src/mcp/         (transport, tools, error shaping)
   │
   ▼
Scene graph           src/scene/       (Zod schemas, validation, store, mutations)
   │
   ├─▶ layout         src/layout/      (sizes and positions for elements with no coordinates)
   ├─▶ semantic       src/semantic/    (node/connection/axis/… ▸ primitives)
   │
   ▼
SvgNode tree          src/renderer/    (closed, allow-listed representation of an SVG document)
   │
   ├─▶ toSvgString()  ─────────────────▶  SVG returned by the MCP tools
   └─▶ <SceneRenderer> ────────────────▶  React, for the interactive UI
```

### Five ideas hold this together

**1. The scene graph is the artefact, SVG is only an output format.**
Everything the model sends is validated into a `Scene` and stored. Rendering is a pure function of
that scene, so the same diagram can later be re-rendered in a different theme, or by a different
backend, without the model being involved.

**2. Semantic elements compile down to primitives.**
`database` becomes a path, an ellipse and two text blocks. `connection` becomes a path with a
marker. The renderer only ever sees the ten primitives — which keeps it small, and means adding
`neuron`, `decisionTree` or `functionPlot` later is *one expander file* in `src/semantic/`, with no
change to the schema union, the layout engine or the renderer.

**3. One geometry pipeline, two backends.**
The renderer's real output is an `SvgNode` tree, not a string. `serialize()` turns it into markup
for the MCP tools; `<SceneRenderer>` maps it to React elements for the UI. There is no second
implementation to drift, and no `dangerouslySetInnerHTML` anywhere in the project.

**4. Errors are written for a model, not for a log file.**

```json
{
  "success": false,
  "error": {
    "code": "ELEMENT_NOT_FOUND",
    "message": "Connection 'c1' points to 'router-2' (to), which does not exist in the scene.",
    "path": "c1.to",
    "hint": "Existing elements you can connect: pc, switch, router-1, server."
  }
}
```

A code to branch on, a sentence that names the problem, and a hint that contains the answer.
Never a stack trace.

**5. Every mutation is atomic.**
A rejected edit leaves the stored scene byte-for-byte as it was. Without that, one bad call would
corrupt the diagram for the rest of the conversation.

### Deviations from the originally sketched layout

- **`src/layout/` is its own module**, separate from `src/semantic/`. Positioning and
  meaning-to-shape expansion are different problems, and the split is what makes swapping in Dagre
  or ELK later a change to one file (`src/layout/flow.ts`) — its `FlowItem` in / centres out
  interface is deliberately the shape those libraries expose.
- **`SvgNode` sits between the renderer and its output** (idea 3 above), which is what lets the
  React view exist without a second renderer and without unsafe HTML injection.
- **`src/mcp/widget.ts` is a dependency-free vanilla viewer**, separate from the React app in
  `src/ui/`. The ChatGPT iframe resource must be a single self-contained HTML string with no build
  step that could be stale or missing at runtime; the React app is the local playground. They share
  the same behaviour (zoom/pan/fit/copy/export) and the same allow-list.
- **Auto-fit is on by default**, so `width`/`height` act as hints rather than a hard canvas. This
  removes the most common failure mode — a model picking a canvas too small and clipping its own
  diagram.

---

## Installation

```bash
git clone <this repo>
cd visual-mcp
npm install
```

Requires Node 20+ (developed on Node 22/26).

---

## Development

```bash
npm run dev:http      # MCP server over Streamable HTTP on http://localhost:3333/mcp
npm run dev:stdio     # MCP server over stdio (Claude Desktop, MCP Inspector, tunnels)
npm run dev:ui        # React playground on http://localhost:5180
npm test              # 128 tests
npm run typecheck
npm run build         # server → dist/
npm run build:ui      # playground → dist-ui/
npm run examples      # render the reference scenes → examples/out/index.html
```

Quick end-to-end check against a running server:

```bash
npm run dev:http &
npx tsx scripts/smoke-mcp.ts
```

It replays the whole target conversation — build a diagram with no coordinates, inspect it, move
two nodes, wrap everything in a box — and asserts the result at each step.

---

## Available MCP tools

| Tool | What it does | When the model should reach for it |
| --- | --- | --- |
| **`render_diagram`** | Builds **and** renders a whole scene in one call, returns a `sceneId`. | Any request to draw, visualise, diagram, illustrate or explain visually. The default entry point. |
| `render_scene` | Re-renders a stored scene. | After a batch of edits, to show the result. |
| `get_scene` | Returns the scene plus the **computed box of every element**. | Before editing — especially for relative changes ("a bit to the right"). |
| `add_element` | Adds one element, optionally inside a group. | "Add a load balancer", "draw an arrow from A to B". |
| `update_element` | Changes only the fields given; `null` clears one. | Every "change that" request. Never redraw for this. |
| `remove_element` | Deletes an element, cascading its connections and labels. | "Remove the cache". |
| `group_elements` | Wraps top-level elements in a labelled box, moving nothing. | "Put all of this inside AWS", "group these into a VPC". |
| `create_scene` | Creates an empty canvas. | Only when assembling a large diagram incrementally. |
| `clear_scene` | Empties a scene, keeping its canvas/theme/title. | "Scrap that, let's start over". |
| `list_examples` | Returns working example scenes and the type catalogue. | When unsure how to express something — copy and adapt. |

Every tool description states what it does, when to use it, **when not to**, and what each property
means, because another model reads these and decides on its own. Read-only tools carry
`readOnlyHint: true` and destructive ones `destructiveHint: true`, which hosts use to decide what
needs confirmation.

---

## Scene schema

```ts
interface Scene {
  id?: string;
  title?: string;
  subtitle?: string;
  width?: number;          // hint; autoFit grows the canvas so nothing is clipped
  height?: number;
  autoFit?: boolean;       // default true
  background?: string;
  theme?: "dark" | "light" | "blueprint" | "paper";
  themeOverrides?: Partial<Theme>;
  layout?: "auto" | "layered" | "horizontal" | "vertical" | "grid" | "manual";
  direction?: "right" | "down" | "left" | "up";
  gap?: number;
  padding?: number;
  legend?: boolean;
  elements: VisualElement[];
}
```

Every element has `id` and `type`. Ids are stable and are how conversational editing works.

### Primitives — what the renderer can draw

`circle` · `ellipse` · `rectangle` · `line` · `arrow` · `text` · `polygon` · `polyline` · `path` ·
`group`

### Semantic elements — what the model should actually use

| Type | Purpose |
| --- | --- |
| `node` | Labelled box. Ten shapes (`rounded`, `circle`, `diamond`, `hexagon`, `cylinder`, `cloud`, `stack`, `screen`, `pill`, `rect`). Sizes itself from the label; positions itself from the connections. |
| `connection` | Link **by id**: `{ from: "a", to: "b" }`. Finds both borders, adds the arrowhead, stays correct when either end moves. Routing: `straight`, `curved`, `orthogonal`. |
| `group` | Labelled container with its own layout. Boundaries like "AWS", "VLAN 10". |
| `axis` | A coordinate system **and** a data frame. |
| `point` / `scatter` / `cluster` / `plotLine` | Markers and lines in **data** coordinates when given `frame: "<axis id>"`. `cluster` generates a deterministic, seeded blob of points. |
| `label` | Caption that can be attached to another element by id and follows it. |
| `server` `database` `router` `switch` `computer` `cloud` | Domain presets — a `node` with the right shape and glyph already chosen. |

### Layout

`layout: "auto"` (the default) builds a layered flow from the connection graph when there are any,
otherwise a row. Elements **with** explicit `x`/`y` are never moved, so the model can nudge one node
without disturbing the rest. `direction` controls which way the flow grows.

### Data frames

An `axis` declares a mapping from data units to pixels; anything with `frame: "<axis id>"` is
placed in data coordinates, with `y` growing upwards as it should:

```json
{ "id": "plot",  "type": "axis",    "x": 90, "y": 70, "width": 620, "height": 420,
  "xRange": [0, 10], "yRange": [0, 10], "xLabel": "Feature 1", "yLabel": "Feature 2" },
{ "id": "class-a", "type": "cluster", "frame": "plot", "x": 3.4, "y": 6.6,
  "count": 40, "spread": 0.8, "label": "Class A", "hull": true, "seed": 7 }
```

### Themes

Four built-in themes (`dark`, `light`, `blueprint`, `paper`), each a full palette plus a font stack
that requires **no external font**. Elements refer to tokens — `primary`, `surface`, `muted`,
`danger` — rather than hard-coded colours, so a whole diagram restyles without touching its
geometry. `themeOverrides` changes any token.

---

## Running locally

### As a library, with no MCP at all

```ts
import { renderScene } from "visual-mcp";

const svg = renderScene({
  title: "Request flow",
  elements: [
    { id: "client", type: "computer", label: "Client" },
    { id: "api", type: "server", label: "API" },
    { id: "c", type: "connection", from: "client", to: "api", label: "HTTPS" },
  ],
});
```

### As an HTTP server

```bash
npm run dev:http
```

| Route | |
| --- | --- |
| `POST /mcp` | MCP Streamable HTTP endpoint |
| `GET /health` | health check |
| `GET /scenes` | stored scenes |
| `GET /scenes/:id.svg` | a rendered scene |
| `GET /viewer?svg=/scenes/:id.svg` | the interactive viewer, standalone |

The server is **stateless**: each request gets its own `McpServer` and transport, and the scene
store is the only shared state. That is what makes it safe behind a load balancer or on a
serverless platform, where two turns of one conversation may not reach the same process.

### As a stdio server (MCP Inspector, Claude Desktop, Cursor)

```bash
npx @modelcontextprotocol/inspector npx tsx src/mcp/stdio.ts
```

```json
{
  "mcpServers": {
    "visual-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/visual-mcp/dist/mcp/stdio.js"]
    }
  }
}
```

---

## Connecting to ChatGPT

ChatGPT reaches remote MCP servers over **Streamable HTTP at a public HTTPS endpoint**, so the
server needs to be reachable from the internet. Two ways:

### A. Quick test with a tunnel

```bash
npm run dev:http                  # http://localhost:3333/mcp
npx localtunnel --port 3333       # or: ngrok http 3333, or cloudflared tunnel
```

### B. Deploy with Docker on a VPS

`docker-compose.yml` runs two containers: the MCP server on port 4000 (not published to the
internet) and **Caddy**, which terminates TLS in front of it and renews the certificate
automatically.

HTTPS is served on **port 500**, not 443, because port 443 on this VPS belongs to another
service. That has one consequence worth understanding: the TLS-ALPN challenge only works on
443, so certificates are validated over **HTTP-01 on port 80**. Port 80 must be reachable
from the internet or no certificate is ever issued — and renewals (every ~60 days) need it
just as much as the first issuance.

**1. Pick a public hostname.** ChatGPT requires HTTPS, and a bare IP cannot have a
certificate. Without a domain of your own, use [sslip.io](https://sslip.io) — it resolves
`<ip>.sslip.io` to that IP with no registration, and Let's Encrypt issues certificates for it:

```bash
curl -4 ifconfig.me            # on the VPS -> e.g. 203.0.113.45
# hostname becomes: 203.0.113.45.sslip.io
```

**2. Configure and start:**

```bash
cp .env.example .env
# MCP_DOMAIN=203.0.113.45.sslip.io   (MCP_HTTPS_PORT defaults to 500)
docker compose up -d --build
```

**3. Open the ports.** Inbound TCP **80** and **500** — both in the VPS firewall and in the
provider's security group:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 500/tcp
```

**4. Verify** (the first request may take a few seconds while the certificate is issued):

```bash
curl https://$MCP_DOMAIN:500/health       # {"status":"ok",...}
docker compose logs caddy | grep -i "certificate obtained"
```

The MCP URL is then `https://<MCP_DOMAIN>:500/mcp`, and it is permanent: `restart:
unless-stopped` survives reboots, and the certificates live in the `caddy_data` volume, so
renewals persist across `docker compose down`/`up`. Only `docker compose down -v` wipes them.

`PUBLIC_URL` and `ALLOWED_HOSTS` are derived from `MCP_DOMAIN` and `MCP_HTTPS_PORT` by
Compose. Both must carry the port: `PUBLIC_URL` because `svgUrl` links would otherwise point
at 443, and `ALLOWED_HOSTS` because the SDK compares the raw `Host` header — which reads
`<domain>:500` on a non-standard port — as an exact string.

**If port 80 is also taken**, this setup cannot work as-is: some other web server owns the
machine's HTTP entry point. Find it with `sudo ss -lptn 'sport = :80 or sport = :443'` and
add visual-mcp as a virtual host there instead, proxying to `http://127.0.0.1:4000`.

### Without Compose

```bash
docker build -t visual-mcp .
docker run -d --name visual-mcp --restart unless-stopped -p 127.0.0.1:4000:4000 \
  -e PUBLIC_URL=https://your-host -e ALLOWED_HOSTS=your-host visual-mcp
```

Then point any reverse proxy at `http://127.0.0.1:4000`. The container runs as the non-root
`node` user, ships a `/health` HEALTHCHECK and carries only production dependencies.
Managed platforms (Fly.io, Railway, Render, Cloud Run) work too — they inject their own
`PORT`, which the server honours.

### Then, in ChatGPT

1. **Enable developer mode.** It is available on ChatGPT Business, Enterprise and Edu on the web.
   An admin enables it in **Workspace Settings → Permissions & Roles → Connected Data →
   Developer mode / Create custom MCP connectors**.
2. **Settings → Connectors → Create / Advanced → Developer mode → Add custom connector.**
3. Fill in:
   - **Name**: `Visual MCP`
   - **MCP server URL**: `https://<your-host>/mcp`
   - **Authentication**: `No authentication` (this server ships without auth — see *Security*)
4. Save. ChatGPT calls `tools/list` immediately; you should see the ten tools listed.
5. In a new chat, enable the connector and ask for a diagram.

The server also registers an **MCP Apps UI resource** (`ui://visual-mcp/scene.html`,
`text/html;profile=mcp-app`), attached to the rendering tools through
`_meta.ui.resourceUri` and the ChatGPT alias `_meta["openai/outputTemplate"]`. Where that is
supported, the diagram appears in an interactive frame with zoom, pan, fit, copy and export;
elsewhere the tools still return the SVG in `structuredContent`, so the server degrades gracefully.

---

## Examples

`npm run examples` renders all five to `examples/out/index.html`, and `list_examples` serves them to
the model.

### 1. Network — `examples/out/network.svg`

Domain presets and automatic left-to-right layout. `computer → switch → router → server`,
with VLAN captions on the links. No coordinates anywhere in the source scene.

### 2. LDA — `examples/out/lda.svg`

An `axis` data frame, two seeded `cluster`s with soft hulls, a dashed decision boundary and the LDA
direction — all in data coordinates, both lines clipped to the plot.

### 3. Regression — `examples/out/regression.svg`

Axis, a `scatter` series and a fitted `plotLine` with `extend: true`, on the light theme.

### 4. Software architecture — `examples/out/architecture.svg`

`React → REST API → { Redis, PostgreSQL }`, with the two stores inside a labelled `group`
("Data layer") that the connections route into.

### 5. Binary tree — `examples/out/tree.svg`

Seven circular nodes and six connections; the layered layout flowing `down` produces the tree.

### Prompts to try in ChatGPT

```text
Draw the architecture where React talks to NestJS, NestJS uses PostgreSQL and also queries Redis.
Now put Redis above the backend and the database below it.
Now put all the infrastructure inside a box called AWS.
Make PostgreSQL bigger and give it a purple border.

Explain Linear Discriminant Analysis visually.
Show me graphically how linear regression works.
Draw a network where a PC in VLAN 20 reaches a server in VLAN 10 through a switch and a router.
Draw a balanced binary tree with 7 nodes.
Explain the TCP three-way handshake as a diagram.
Diagram merge sort on [5, 2, 9, 1].
```

---

## Security

The threat model is simple: **everything the server renders originated in a language model**, and
that output may itself carry text the user pasted from somewhere else. So nothing model-derived is
ever treated as code.

- **Closed schema.** Only the twenty-four known element types parse. Colours must match a
  hex/rgb/hsl/keyword/token grammar — `url(javascript:…)` is rejected at validation. Path data must
  match SVG path commands and numbers, nothing else.
- **Allow-listed output.** The renderer can only emit tags and attributes from two explicit lists
  in `src/renderer/svgNode.ts`. There is no `on*`, no `href`, no `style`, no `class`, no
  `<foreignObject>`, no `<script>` — the model cannot express them, and the serialiser would drop
  them anyway.
- **Escaping.** Text content and attribute values are XML-escaped on the way out.
- **No `dangerouslySetInnerHTML`, no `eval`, no `new Function`** anywhere in the project. The React
  view builds elements from the `SvgNode` tree; the ChatGPT widget parses the SVG and **rebuilds it
  node by node against the same allow-lists**, so even a compromised server cannot get script into
  that frame.
- **Bounded input.** Element counts, string lengths, point counts, path length and stored scenes are
  all capped; scenes are evicted oldest-first.
- **No stack traces to the model.** Every handler is wrapped; anything unexpected becomes
  `INTERNAL_ERROR` with a short message.

Tests in `tests/security.test.tsx` assert each of these.

**Not included, by design:** authentication. The server exposes no secrets and touches no external
system, but a public deployment is a public scene store. Put it behind your platform's auth, or add
OAuth via the SDK's auth helpers, before exposing it to anyone but yourself. Set `ALLOWED_HOSTS` to
turn on DNS-rebinding protection when it is reachable from a browser.

---

## Current limitations

- **Text metrics are estimated**, not measured — there is no font engine on the server. Widths are
  within a few percent for the bundled sans-serif stacks, which is enough for boxes and wrapping,
  but an unusual font or a lot of CJK will size slightly loose.
- **The layout engine is intentionally small.** Longest-path layering with rank centring. It has no
  crossing minimisation and no overlap resolution, so a dense graph (roughly 25+ nodes with many
  cross-links) will produce crossings a real engine would avoid. The interface is Dagre-shaped for
  exactly this reason.
- **Tree layouts are not child-centred**; a parent sits at the centre of its rank, not above the
  midpoint of its children.
- **`render_diagram`'s JSON Schema is about 50 KB** (~12k tokens) because it teaches the whole
  element vocabulary. The other nine tools total ~5 KB. That is a deliberate trade: the model gets
  per-field documentation and rarely needs a repair round trip.
- **Inside a group with automatic layout, children's explicit `x`/`y` are ignored** — the layout
  wins. Use `layout: "manual"` on the group to position children yourself.
- **Storage is in-memory.** Scenes do not survive a restart, and with multiple replicas a scene
  lives on whichever instance created it. The `SceneStore` interface exists so this is one class to
  replace.
- **Static output.** No animation, no 3D, no maths expression parser yet — see below.

---

## Roadmap

**Next**
- Persistent `SceneStore` (SQLite first) — the interface is already in place.
- Undo/redo. Every mutation is already recorded as a `SceneMutation`; this is a matter of storing
  the inverse.
- Dagre or ELK behind `src/layout/flow.ts` for dense graphs, with the small engine as the default.
- Child-centred tree layout.

**Maths** — the `axis` data frame is the foundation; each of these is one expander in
`src/semantic/`, with no renderer change:
`functionPlot` (`{ "expression": "x^2", "domain": [-5, 5] }`), `vector`, `matrix`, `plane`,
`distribution`, `projection`, `decisionBoundary` and `regressionLine` as named aliases of
`plotLine`.

**Diagram vocabulary** — `neuron`, `neuralNetwork`, `decisionTree`, `sequenceDiagram`, `stateMachine`,
`gantt`, `swimlane`.

**Animation** — `{ "animation": { "type": "flow", "duration": 1200 } }` on a connection, emitted as
SVG SMIL or CSS so it stays declarative and needs no runtime. Packets moving along a link, a request
travelling through a pipeline, an algorithm stepping through a structure.

**Other renderers** — the resolve pipeline already ends in a backend-agnostic tree. A `Scene` with
`kind: "3d"` and `{ "type": "sphere", "position": [0, 1, 0] }` would select a Three.js backend
instead of the SVG one; a Canvas backend would serve very large scatter plots. No change to the MCP
layer.

---

## License

MIT
