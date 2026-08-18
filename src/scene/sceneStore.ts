import { visualError } from "./errors.js";
import type { Scene, SceneMutation } from "./types.js";

/**
 * Persistence boundary.
 *
 * The MVP keeps scenes in memory, but nothing above this interface knows that.
 * Swapping in SQLite, Postgres or Redis means writing one class - the MCP tools
 * are untouched.
 */
export interface SceneStore {
  create(scene: Scene): Scene;
  get(id: string): Scene | undefined;
  /** Same as `get` but throws a model-friendly SCENE_NOT_FOUND. */
  require(id: string): Scene;
  save(scene: Scene): Scene;
  delete(id: string): boolean;
  list(): SceneSummary[];
  record(id: string, mutation: SceneMutation): void;
  history(id: string): SceneMutation[];
}

export interface SceneSummary {
  id: string;
  title?: string;
  elementCount: number;
  updatedAt: number;
}

interface Entry {
  scene: Scene;
  mutations: SceneMutation[];
  updatedAt: number;
}

export class InMemorySceneStore implements SceneStore {
  private readonly entries = new Map<string, Entry>();
  private counter = 0;

  /** Oldest scenes are evicted first so a long-lived server cannot grow forever. */
  constructor(private readonly maxScenes = 200) {}

  nextId(): string {
    this.counter += 1;
    return `scene-${Date.now().toString(36)}-${this.counter.toString(36)}`;
  }

  create(scene: Scene): Scene {
    const id = scene.id ?? this.nextId();
    const stored: Scene = { ...scene, id };
    this.entries.set(id, {
      scene: stored,
      mutations: [{ type: "create", timestamp: Date.now(), summary: `created scene '${id}'` }],
      updatedAt: Date.now(),
    });
    this.evict();
    return stored;
  }

  get(id: string): Scene | undefined {
    return this.entries.get(id)?.scene;
  }

  require(id: string): Scene {
    const scene = this.get(id);
    if (!scene) {
      const known = this.list()
        .slice(0, 10)
        .map((s) => s.id);
      throw visualError("SCENE_NOT_FOUND", `No scene with id '${id}'.`, {
        hint: known.length
          ? `Known scenes: ${known.join(", ")}. Or call create_scene / render_diagram to make a new one.`
          : "Call create_scene or render_diagram first - no scenes exist yet.",
      });
    }
    return scene;
  }

  save(scene: Scene): Scene {
    const id = scene.id;
    if (!id) throw visualError("INTERNAL_ERROR", "Cannot save a scene without an id.");
    const existing = this.entries.get(id);
    this.entries.set(id, {
      scene,
      mutations: existing?.mutations ?? [],
      updatedAt: Date.now(),
    });
    this.evict();
    return scene;
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  list(): SceneSummary[] {
    return [...this.entries.entries()]
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([id, entry]) => ({
        id,
        ...(entry.scene.title ? { title: entry.scene.title } : {}),
        elementCount: entry.scene.elements?.length ?? 0,
        updatedAt: entry.updatedAt,
      }));
  }

  record(id: string, mutation: SceneMutation): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.mutations.push(mutation);
    // History is bounded: it is a breadcrumb trail, not an event store.
    if (entry.mutations.length > 200) entry.mutations.splice(0, entry.mutations.length - 200);
    entry.updatedAt = mutation.timestamp;
  }

  history(id: string): SceneMutation[] {
    return this.entries.get(id)?.mutations ?? [];
  }

  private evict(): void {
    if (this.entries.size <= this.maxScenes) return;
    const sorted = [...this.entries.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const excess = this.entries.size - this.maxScenes;
    for (let i = 0; i < excess; i++) this.entries.delete(sorted[i]![0]);
  }
}
