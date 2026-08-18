import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createVisualMcpServer } from "../src/mcp/server.js";
import { InMemorySceneStore } from "../src/scene/sceneStore.js";

/**
 * These drive the real MCP server through a real MCP client, so they cover the
 * protocol surface a host actually sees: schemas, annotations, structured
 * output and error shape.
 */

interface ToolResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

let client: Client;

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

async function expectOk(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await call(name, args);
  expect(result.isError, `${name}: ${result.content?.[0]?.text}`).toBeFalsy();
  return result.structuredContent ?? {};
}

beforeEach(async () => {
  const server = createVisualMcpServer({ store: new InMemorySceneStore() });
  client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

describe("tool surface", () => {
  it("exposes the documented set of tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "add_element",
        "clear_scene",
        "create_scene",
        "get_scene",
        "group_elements",
        "list_examples",
        "remove_element",
        "render_diagram",
        "render_scene",
        "update_element",
      ].sort(),
    );
  });

  it("documents when to use and when not to use each tool", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.description!.length, tool.name).toBeGreaterThan(150);
      expect(tool.description!.toUpperCase(), tool.name).toContain("USE THIS");
      expect(tool.title, tool.name).toBeTruthy();
    }
  });

  it("marks read-only tools with the annotation hosts rely on", async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("get_scene")!.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("render_scene")!.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("remove_element")!.annotations?.destructiveHint).toBe(true);
    expect(byName.get("render_diagram")!.annotations?.readOnlyHint).toBe(false);
  });

  it("advertises the MCP Apps UI resource", async () => {
    const { resources } = await client.listResources();
    const widget = resources.find((r) => r.uri === "ui://visual-mcp/scene.html");
    expect(widget).toBeDefined();
    expect(widget!.mimeType).toBe("text/html;profile=mcp-app");

    const read = await client.readResource({ uri: "ui://visual-mcp/scene.html" });
    const content = read.contents[0] as { text?: string };
    expect(String(content.text)).toContain("<!doctype html>");
  });
});

describe("render_diagram", () => {
  it("renders a scene described without a single coordinate", async () => {
    const data = await expectOk("render_diagram", {
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
    expect(data.sceneId).toMatch(/^scene-/);
    expect(String(data.svg)).toMatch(/^<svg/);
    expect(String(data.svg)).toContain("PostgreSQL");
    expect(data.elementCount).toBe(7);
  });

  it("attaches the UI template so the host can render the viewer", async () => {
    const result = await call("render_diagram", { elements: [{ id: "n", type: "node", label: "N" }] });
    expect(result._meta?.["openai/outputTemplate"]).toBe("ui://visual-mcp/scene.html");
    expect((result._meta?.ui as { resourceUri?: string })?.resourceUri).toBe("ui://visual-mcp/scene.html");
  });

  it("tells the model not to redraw the result as ASCII", async () => {
    const result = await call("render_diagram", { elements: [{ id: "n", type: "node", label: "N" }] });
    expect(result.content?.[0]?.text).toMatch(/ASCII/i);
  });

  it("returns a structured, hint-carrying error instead of throwing", async () => {
    const result = await call("render_diagram", {
      elements: [
        { id: "a", type: "node", label: "A" },
        { id: "c", type: "connection", from: "a", to: "missing" },
      ],
    });
    expect(result.isError).toBe(true);
    const error = result.structuredContent?.error as { code: string; hint?: string };
    expect(error.code).toBe("ELEMENT_NOT_FOUND");
    expect(error.hint).toContain("a");
    expect(result.content?.[0]?.text).not.toMatch(/\bat \w+ \(/);
  });
});

describe("conversational editing", () => {
  async function makeScene(): Promise<string> {
    const data = await expectOk("render_diagram", {
      elements: [
        { id: "frontend", type: "node", label: "React" },
        { id: "backend", type: "node", label: "NestJS" },
        { id: "db", type: "database", label: "PostgreSQL" },
        { id: "c1", type: "connection", from: "frontend", to: "backend" },
        { id: "c2", type: "connection", from: "backend", to: "db" },
      ],
    });
    return data.sceneId as string;
  }

  it("reports computed boxes for elements that were never given coordinates", async () => {
    const sceneId = await makeScene();
    const data = await expectOk("get_scene", { sceneId });
    const layout = data.layout as Record<string, { x: number; width: number }>;
    expect(layout.backend!.width).toBeGreaterThan(0);
    expect(layout.db!.x).toBeGreaterThan(layout.frontend!.x);
  });

  it("adds an element without disturbing the others", async () => {
    const sceneId = await makeScene();
    await expectOk("add_element", { sceneId, element: { id: "cache", type: "database", label: "Redis" } });
    await expectOk("add_element", {
      sceneId,
      element: { id: "c3", type: "connection", from: "backend", to: "cache" },
    });
    const data = await expectOk("get_scene", { sceneId });
    expect(data.ids).toContain("cache");
    expect(data.ids).toContain("frontend");
  });

  it("moves one element and keeps everything else", async () => {
    const sceneId = await makeScene();
    await expectOk("update_element", { sceneId, elementId: "db", changes: { x: 640, y: 420 } });
    const data = await expectOk("get_scene", { sceneId });
    const layout = data.layout as Record<string, { x: number; y: number }>;
    expect(layout.db!.y).toBeGreaterThan(300);
    expect((data.scene as { elements: unknown[] }).elements).toHaveLength(5);
  });

  it("leaves the scene untouched when an edit is rejected", async () => {
    const sceneId = await makeScene();
    const before = await expectOk("get_scene", { sceneId });
    const failed = await call("update_element", { sceneId, elementId: "db", changes: { width: -10 } });
    expect(failed.isError).toBe(true);
    const after = await expectOk("get_scene", { sceneId });
    expect(JSON.stringify(after.scene)).toBe(JSON.stringify(before.scene));
  });

  it("removes an element together with the connections that pointed at it", async () => {
    const sceneId = await makeScene();
    const data = await expectOk("remove_element", { sceneId, elementId: "db" });
    expect(data.removed).toEqual(expect.arrayContaining(["db", "c2"]));
    const after = await expectOk("get_scene", { sceneId });
    expect(after.ids).not.toContain("db");
    expect(after.ids).toContain("c1");
  });

  it("wraps elements in a labelled box and keeps the crossing connections", async () => {
    const sceneId = await makeScene();
    await expectOk("group_elements", {
      sceneId,
      groupId: "aws",
      label: "AWS",
      elementIds: ["backend", "db"],
    });
    const rendered = await expectOk("render_scene", { sceneId });
    expect(String(rendered.svg)).toContain("AWS");
    const after = await expectOk("get_scene", { sceneId });
    expect(after.ids).toContain("backend");
  });

  it("keeps the canvas settings when the scene is cleared", async () => {
    const created = await expectOk("create_scene", { title: "Keep me", theme: "light" });
    const sceneId = created.sceneId as string;
    await expectOk("add_element", { sceneId, element: { id: "n", type: "node", label: "N" } });
    await expectOk("clear_scene", { sceneId });
    const data = await expectOk("get_scene", { sceneId });
    expect((data.scene as { title?: string }).title).toBe("Keep me");
    expect((data.scene as { elements: unknown[] }).elements).toHaveLength(0);
  });

  it("records a history the model can read back", async () => {
    const sceneId = await makeScene();
    await expectOk("update_element", { sceneId, elementId: "db", changes: { label: "Postgres 16" } });
    const data = await expectOk("get_scene", { sceneId });
    const history = data.history as { type: string }[];
    expect(history.some((h) => h.type === "update")).toBe(true);
  });

  it("reports a missing scene with the ids that do exist", async () => {
    const result = await call("get_scene", { sceneId: "nope" });
    expect(result.isError).toBe(true);
    expect((result.structuredContent?.error as { code: string }).code).toBe("SCENE_NOT_FOUND");
  });
});

describe("list_examples", () => {
  it("returns a catalogue, then a full scene on request", async () => {
    const catalogue = await expectOk("list_examples");
    expect((catalogue.examples as unknown[]).length).toBeGreaterThanOrEqual(5);
    expect(catalogue.elementTypes).toContain("connection");

    const example = await expectOk("list_examples", { name: "lda" });
    const rendered = await expectOk("render_diagram", example.scene as Record<string, unknown>);
    expect(String(rendered.svg)).toContain("Class A");
  });
});
