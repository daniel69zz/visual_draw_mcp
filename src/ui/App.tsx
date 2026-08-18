import { useMemo, useState } from "react";
import { SceneViewer } from "./SceneViewer.js";
import { EXAMPLES } from "../examples/index.js";
import { validateScene } from "../scene/validate.js";
import type { Scene } from "../scene/types.js";

/**
 * A small playground: pick an example or paste a scene, see it rendered live,
 * and read the exact error the MCP tools would have returned.
 *
 * The point is that this app and the MCP server share one renderer - what you
 * see here is literally what ChatGPT gets.
 */
export function App(): React.ReactElement {
  const [source, setSource] = useState(() => JSON.stringify(EXAMPLES.architecture!.scene, null, 2));

  const parsed = useMemo(() => {
    try {
      const raw: unknown = JSON.parse(source);
      const result = validateScene(raw);
      return result.ok
        ? { scene: result.scene as Scene, error: null }
        : { scene: null, error: `${result.error.code}: ${result.error.message}` };
    } catch (err) {
      return { scene: null, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }, [source]);

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Visual MCP</h1>
          <p>Scene graph in, SVG out. The same pipeline the MCP server uses.</p>
        </header>

        <div className="examples">
          {Object.entries(EXAMPLES).map(([name, entry]) => (
            <button
              key={name}
              onClick={() => setSource(JSON.stringify(entry.scene, null, 2))}
              title={entry.description}
            >
              {name}
            </button>
          ))}
        </div>

        <label htmlFor="scene-json">Scene JSON</label>
        <textarea
          id="scene-json"
          spellCheck={false}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />

        {parsed.error ? <p className="error">{parsed.error}</p> : <p className="ok">Valid scene</p>}
      </aside>

      <main>
        {parsed.scene ? (
          <SceneViewer scene={parsed.scene} />
        ) : (
          <div className="placeholder">Fix the scene to see it rendered.</div>
        )}
      </main>
    </div>
  );
}
