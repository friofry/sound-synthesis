import type { CSSProperties } from "react";

type OscillogramToolbarProps = {
  onNudgeLeft: () => void;
  onNudgeRight: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function OscillogramToolbar({ onNudgeLeft, onNudgeRight, onZoomIn, onZoomOut }: OscillogramToolbarProps) {
  return (
    <div className="oscillogram-toolbar">
      <button type="button" className="osc-btn osc-icon-btn" onClick={onNudgeLeft} title="Scroll left">
        <span className="toolbar-sprite oscill-toolbar-sprite" style={{ "--sprite-index": 0 } as CSSProperties} aria-hidden />
        <span className="sr-only">Scroll left</span>
      </button>
      <button type="button" className="osc-btn osc-icon-btn" onClick={onNudgeRight} title="Scroll right">
        <span className="toolbar-sprite oscill-toolbar-sprite" style={{ "--sprite-index": 1 } as CSSProperties} aria-hidden />
        <span className="sr-only">Scroll right</span>
      </button>
      <button type="button" className="osc-btn osc-icon-btn" onClick={onZoomIn} title="Zoom in (x1)">
        <span className="toolbar-sprite oscill-toolbar-sprite" style={{ "--sprite-index": 3 } as CSSProperties} aria-hidden />
        <span className="sr-only">Zoom in</span>
      </button>
      <button type="button" className="osc-btn osc-icon-btn" onClick={onZoomOut} title="Zoom out (x2)">
        <span className="toolbar-sprite oscill-toolbar-sprite" style={{ "--sprite-index": 2 } as CSSProperties} aria-hidden />
        <span className="sr-only">Zoom out</span>
      </button>
    </div>
  );
}
