import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { SceneRenderer } from "./components/SceneRenderer.js";
import { Toolbar } from "./components/Toolbar.js";
import { renderScene } from "../renderer/index.js";
import { resolveScene } from "../scene/resolve.js";
import type { Scene } from "../scene/types.js";

/**
 * The interactive viewport: zoom, pan, fit and export around a rendered scene.
 * Panning is a CSS transform on a wrapper, so the SVG itself never re-renders
 * while the user drags.
 */

interface View {
  scale: number;
  x: number;
  y: number;
}

const INITIAL: View = { scale: 1, x: 0, y: 0 };

export function SceneViewer({ scene }: { scene: Scene }): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(INITIAL);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const resolved = resolveScene(scene);
  const size = { width: resolved.width, height: resolved.height };

  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const pad = 24;
    const scale = Math.min(
      (rect.width - pad * 2) / size.width,
      (rect.height - pad * 2) / size.height,
    );
    const next = Math.max(0.05, Math.min(scale, 4));
    setView({
      scale: next,
      x: (rect.width - size.width * next) / 2,
      y: (rect.height - size.height * next) / 2,
    });
  }, [size.width, size.height]);

  // Re-fit whenever a different scene is loaded.
  useEffect(() => {
    fit();
  }, [fit, scene]);

  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((current) => {
      const scale = Math.max(0.1, Math.min(current.scale * factor, 12));
      const ratio = scale / current.scale;
      return {
        scale,
        x: cx - (cx - current.x) * ratio,
        y: cy - (cy - current.y) * ratio,
      };
    });
  }, []);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX - view.x, y: event.clientY - view.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setView((current) => ({ ...current, x: event.clientX - start.x, y: event.clientY - start.y }));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const svg = () => renderScene(scene, { idSeed: scene.id ?? "ui-export", pretty: true });

  const copy = async () => {
    await navigator.clipboard.writeText(svg());
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const download = () => {
    const blob = new Blob([svg()], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(scene.title ?? scene.id ?? "diagram").replace(/[^a-z0-9._-]+/gi, "-")}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const centre = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 };
  };

  return (
    <div className="viewer">
      <div
        className="stage"
        ref={stageRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="canvas"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <SceneRenderer scene={scene} />
        </div>
      </div>
      <Toolbar
        zoom={view.scale}
        onFit={fit}
        onReset={() => setView(INITIAL)}
        onZoomIn={() => {
          const c = centre();
          zoomAt(1.25, c.x, c.y);
        }}
        onZoomOut={() => {
          const c = centre();
          zoomAt(0.8, c.x, c.y);
        }}
        onCopy={copy}
        onExport={download}
        copied={copied}
        size={size}
      />
    </div>
  );
}
