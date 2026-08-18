/**
 * The MCP Apps UI resource.
 *
 * ChatGPT (and any MCP Apps host) loads this HTML in a sandboxed iframe and
 * pushes tool results into it over the postMessage bridge. It gives the user a
 * real viewer - zoom, pan, fit, copy - instead of a static picture.
 *
 * Two deliberate constraints:
 *
 *  - Zero dependencies and zero build step. This string is the artifact; there
 *    is no bundler output that could be stale or missing at runtime.
 *  - The incoming SVG is never assigned to innerHTML. It is parsed, then
 *    rebuilt node by node against the same tag/attribute allow-list the server
 *    uses. Even a compromised server cannot get script into this frame.
 */

export const WIDGET_URI = "ui://visual-mcp/scene.html";
export const WIDGET_MIME = "text/html;profile=mcp-app";

const ALLOWED_TAGS = [
  "svg", "g", "defs", "marker", "filter", "feDropShadow", "rect", "circle",
  "ellipse", "line", "path", "polygon", "polyline", "text", "tspan", "title",
  "desc", "clipPath", "linearGradient", "stop",
];

const ALLOWED_ATTRS = [
  "id", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx",
  "cy", "r", "rx", "ry", "d", "points", "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
  "stroke-linejoin", "opacity", "transform", "font-family", "font-size",
  "font-weight", "font-style", "text-anchor", "dominant-baseline", "dy",
  "marker-start", "marker-end", "markerWidth", "markerHeight", "markerUnits",
  "refX", "refY", "orient", "filter", "stdDeviation", "flood-color",
  "flood-opacity", "offset", "stop-color", "stop-opacity", "gradientUnits",
  "clip-path", "shape-rendering", "text-rendering", "role", "aria-label",
  "data-element-id",
];

export const WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual MCP</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    display: flex; flex-direction: column; background: transparent; color: inherit;
  }
  #stage {
    position: relative; flex: 1; min-height: 260px; overflow: hidden;
    border-radius: 12px; border: 1px solid rgba(128,128,128,.28);
    cursor: grab; touch-action: none; background: transparent;
  }
  #stage.dragging { cursor: grabbing; }
  #canvas { position: absolute; transform-origin: 0 0; will-change: transform; }
  #canvas svg { display: block; }
  #bar {
    display: flex; gap: 6px; align-items: center; padding: 8px 2px 0; flex-wrap: wrap;
  }
  button {
    font: inherit; padding: 5px 11px; border-radius: 7px; cursor: pointer;
    border: 1px solid rgba(128,128,128,.32); background: rgba(128,128,128,.10); color: inherit;
  }
  button:hover { background: rgba(128,128,128,.2); }
  button:active { transform: translateY(1px); }
  #zoom { margin-left: auto; opacity: .6; font-variant-numeric: tabular-nums; }
  #empty { position: absolute; inset: 0; display: grid; place-items: center; opacity: .55; }
</style>
</head>
<body>
<div id="stage">
  <div id="canvas"></div>
  <div id="empty">Waiting for a diagram…</div>
</div>
<div id="bar">
  <button id="fit" title="Fit the diagram to the window">Fit</button>
  <button id="reset" title="Reset zoom to 100%">Reset</button>
  <button id="zoomIn" title="Zoom in">+</button>
  <button id="zoomOut" title="Zoom out">−</button>
  <button id="copy" title="Copy the SVG markup to the clipboard">Copy SVG</button>
  <button id="download" title="Download the SVG file">Export</button>
  <span id="zoom">100%</span>
</div>
<script>
(function () {
  "use strict";
  var ALLOWED_TAGS = ${JSON.stringify(ALLOWED_TAGS)};
  var ALLOWED_ATTRS = ${JSON.stringify(ALLOWED_ATTRS)};
  var NS = "http://www.w3.org/2000/svg";

  var stage = document.getElementById("stage");
  var canvas = document.getElementById("canvas");
  var empty = document.getElementById("empty");
  var zoomLabel = document.getElementById("zoom");

  var view = { scale: 1, x: 0, y: 0 };
  var current = { svg: "", width: 0, height: 0, title: "diagram" };

  /**
   * Rebuilds an SVG document from a string without ever touching innerHTML.
   * Anything outside the allow-lists is dropped, so no script, no event
   * handler and no external reference can survive this pass.
   */
  function sanitize(source) {
    var parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    if (parsed.getElementsByTagName("parsererror").length) return null;
    var root = parsed.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg") return null;
    return rebuild(root);
  }

  function rebuild(source) {
    var tag = source.nodeName;
    if (ALLOWED_TAGS.indexOf(tag) === -1) return null;
    var el = document.createElementNS(NS, tag);
    for (var i = 0; i < source.attributes.length; i++) {
      var attr = source.attributes[i];
      if (ALLOWED_ATTRS.indexOf(attr.name) === -1) continue;
      if (/^\\s*(javascript|data):/i.test(attr.value)) continue;
      el.setAttribute(attr.name, attr.value);
    }
    for (var c = 0; c < source.childNodes.length; c++) {
      var child = source.childNodes[c];
      if (child.nodeType === 3) {
        el.appendChild(document.createTextNode(child.nodeValue));
      } else if (child.nodeType === 1) {
        var built = rebuild(child);
        if (built) el.appendChild(built);
      }
    }
    return el;
  }

  function show(payload) {
    if (!payload || typeof payload.svg !== "string") return;
    var built = sanitize(payload.svg);
    if (!built) return;
    current = {
      svg: payload.svg,
      width: Number(payload.width) || 800,
      height: Number(payload.height) || 600,
      title: payload.title || payload.sceneId || "diagram"
    };
    built.setAttribute("width", String(current.width));
    built.setAttribute("height", String(current.height));
    while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
    canvas.appendChild(built);
    empty.style.display = "none";
    fit();
  }

  function apply() {
    canvas.style.transform =
      "translate(" + view.x + "px," + view.y + "px) scale(" + view.scale + ")";
    zoomLabel.textContent = Math.round(view.scale * 100) + "%";
  }

  function fit() {
    var rect = stage.getBoundingClientRect();
    if (!current.width || !current.height || !rect.width) return;
    var pad = 16;
    var scale = Math.min(
      (rect.width - pad * 2) / current.width,
      (rect.height - pad * 2) / current.height
    );
    view.scale = Math.max(0.05, Math.min(scale, 4));
    view.x = (rect.width - current.width * view.scale) / 2;
    view.y = (rect.height - current.height * view.scale) / 2;
    apply();
  }

  function zoomAt(factor, cx, cy) {
    var next = Math.max(0.1, Math.min(view.scale * factor, 12));
    var ratio = next / view.scale;
    view.x = cx - (cx - view.x) * ratio;
    view.y = cy - (cy - view.y) * ratio;
    view.scale = next;
    apply();
  }

  stage.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = stage.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  var drag = null;
  stage.addEventListener("pointerdown", function (e) {
    drag = { x: e.clientX - view.x, y: e.clientY - view.y };
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", function (e) {
    if (!drag) return;
    view.x = e.clientX - drag.x;
    view.y = e.clientY - drag.y;
    apply();
  });
  ["pointerup", "pointercancel"].forEach(function (name) {
    stage.addEventListener(name, function () {
      drag = null;
      stage.classList.remove("dragging");
    });
  });

  document.getElementById("fit").onclick = fit;
  document.getElementById("reset").onclick = function () {
    view.scale = 1; view.x = 0; view.y = 0; apply();
  };
  document.getElementById("zoomIn").onclick = function () {
    var r = stage.getBoundingClientRect();
    zoomAt(1.25, r.width / 2, r.height / 2);
  };
  document.getElementById("zoomOut").onclick = function () {
    var r = stage.getBoundingClientRect();
    zoomAt(0.8, r.width / 2, r.height / 2);
  };
  document.getElementById("copy").onclick = function () {
    if (!current.svg || !navigator.clipboard) return;
    navigator.clipboard.writeText(current.svg).then(function () {
      var b = document.getElementById("copy");
      var was = b.textContent;
      b.textContent = "Copied";
      setTimeout(function () { b.textContent = was; }, 1200);
    });
  };
  document.getElementById("download").onclick = function () {
    if (!current.svg) return;
    // Hosts may block iframe-initiated downloads; the copy button is the fallback.
    var blob = new Blob([current.svg], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = String(current.title).replace(/[^a-z0-9._-]+/gi, "-") + ".svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };

  window.addEventListener("resize", fit);

  // MCP Apps bridge: tool results arrive as postMessage notifications.
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data) return;
    var method = data.method || (data.data && data.data.method);
    if (method !== "ui/notifications/tool-result") return;
    var params = (data.params) || (data.data && data.data.params) || {};
    show(params.structuredContent || params.result || params);
  }, { passive: true });

  // ChatGPT also exposes the last result synchronously on window.openai.
  try {
    var host = window.openai;
    if (host && host.toolOutput) show(host.toolOutput);
  } catch (e) { /* not running inside ChatGPT */ }

  // Standalone preview: ?svg=<url> loads a scene from the HTTP server.
  try {
    var q = new URLSearchParams(location.search).get("svg");
    if (q && /^[\\w./-]+$/.test(q)) {
      fetch(q).then(function (r) { return r.text(); }).then(function (text) {
        show({ svg: text, width: 0, height: 0 });
        var el = canvas.querySelector("svg");
        if (el) {
          current.width = parseFloat(el.getAttribute("width")) || 800;
          current.height = parseFloat(el.getAttribute("height")) || 600;
          fit();
        }
      }).catch(function () {});
    }
  } catch (e) { /* no query support */ }
})();
</script>
</body>
</html>`;
