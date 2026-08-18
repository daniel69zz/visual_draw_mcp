export interface ToolbarProps {
  zoom: number;
  size: { width: number; height: number };
  copied: boolean;
  onFit: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCopy: () => void;
  onExport: () => void;
}

export function Toolbar(props: ToolbarProps): React.ReactElement {
  return (
    <div className="toolbar">
      <button onClick={props.onFit} title="Fit the diagram to the window">
        Fit
      </button>
      <button onClick={props.onReset} title="Reset zoom and position">
        Reset view
      </button>
      <button onClick={props.onZoomOut} title="Zoom out">
        −
      </button>
      <button onClick={props.onZoomIn} title="Zoom in">
        +
      </button>
      <button onClick={props.onCopy} title="Copy the SVG markup">
        {props.copied ? "Copied" : "Copy SVG"}
      </button>
      <button onClick={props.onExport} title="Download the SVG file">
        Export SVG
      </button>
      <span className="meta">
        {Math.round(props.zoom * 100)}% · {Math.round(props.size.width)}×{Math.round(props.size.height)}
      </span>
    </div>
  );
}
