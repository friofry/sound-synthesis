import type { CSSProperties } from "react";
import type { ToolMode } from "../../engine/types";
import { useGraphStore } from "../../store/graphStore";
import { MfcToolbar, type MfcToolbarItem, type MfcToolbarSeparator } from "../ui/MfcToolbar";

type ToolEntry = MfcToolbarItem<ToolMode> & {
  spriteIndex: number;
  implemented: boolean;
  description?: string;
};

const TOOLS: Array<ToolEntry | MfcToolbarSeparator> = [
  { id: "move-group", spriteIndex: 0, label: "Move group", implemented: true },
  { id: "drag-point", spriteIndex: 0, label: "Drag point", implemented: true },
  { id: "drag-viewport", spriteIndex: 1, label: "Drag viewport", implemented: true },
  { kind: "separator", id: "sep-1" },
  { id: "modify-point", spriteIndex: 2, label: "Modify point", implemented: true },
  { id: "modify-link", spriteIndex: 3, label: "Modify link", implemented: true },
  { kind: "separator", id: "sep-2" },
  { id: "delete-point", spriteIndex: 4, label: "Delete point", implemented: true },
  { id: "delete-link", spriteIndex: 5, label: "Delete link", implemented: true },
  { kind: "separator", id: "sep-3" },
  {
    id: "add-point-link",
    spriteIndex: 6,
    label: "Add point/link",
    implemented: true,
    description:
      "Click a point, then click another point to link them. Click empty space to add a new point. To add a point into an existing group, click inside the group bounding box.",
  },
  { kind: "separator", id: "sep-4" },
];

const EXTRA_TOOLS: Array<ToolEntry | MfcToolbarSeparator> = [
  { id: "playing-point", spriteIndex: 9, label: "Playing point", implemented: true },
  { id: "modify-group", spriteIndex: 10, label: "Modify group", implemented: true },
];

const TOOL_ITEMS = TOOLS.map((entry) =>
  isSeparator(entry)
    ? entry
    : {
        ...entry,
        disabled: !entry.implemented,
        title: entry.implemented
          ? (entry.description ?? entry.label)
          : `${entry.label} (not implemented yet)`,
      },
);

const EXTRA_TOOL_ITEMS = EXTRA_TOOLS.map((entry) =>
  isSeparator(entry)
    ? entry
    : {
        ...entry,
        disabled: !entry.implemented,
        title: entry.implemented ? entry.label : `${entry.label} (not implemented yet)`,
      },
);

export type EditorToolbarViewProps = {
  tool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  onAddCellGraph: () => void;
  onAddHexGraph: () => void;
  onReprepareAndGenerate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function EditorToolbarView({
  tool,
  onSelectTool,
  onAddCellGraph,
  onAddHexGraph,
  onReprepareAndGenerate,
  onZoomIn,
  onZoomOut,
}: EditorToolbarViewProps) {
  return (
    <header className="toolbar">
      <MfcToolbar
        items={TOOL_ITEMS}
        selectedId={tool}
        onSelect={onSelectTool}
        className="toolbar-tools"
        orientation="vertical"
        buttonClassName="toolbar-icon-btn"
        renderItem={(entry) => (
          <>
            {entry.id === "move-group" ? (
              <span className="toolbar-selection-rect-icon" aria-hidden />
            ) : (
              <span
                className="toolbar-sprite toolbar3-sprite"
                style={{ "--sprite-index": entry.spriteIndex } as CSSProperties}
                aria-hidden
              />
            )}
            <span className="sr-only">{entry.label}</span>
          </>
        )}
      />
      <div className="toolbar-tools">
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onAddCellGraph}
          title="Add cell graph"
          aria-label="Add cell graph"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite toolbar3-sprite" style={{ "--sprite-index": 7 } as CSSProperties} aria-hidden />
            <span className="sr-only">Add cell graph</span>
          </span>
        </button>
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onAddHexGraph}
          title="Add hexagonal graph"
          aria-label="Add hexagonal graph"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite toolbar3-sprite" style={{ "--sprite-index": 8 } as CSSProperties} aria-hidden />
            <span className="sr-only">Add hexagonal graph</span>
          </span>
        </button>
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onReprepareAndGenerate}
          title="Reprepare graph and generate octaves (2)"
          aria-label="Reprepare graph and generate octaves (2)"
        >
          <span className="mfc-toolbar-button-content">🔄</span>
        </button>
      </div>
      <MfcToolbar
        items={EXTRA_TOOL_ITEMS}
        selectedId={tool}
        onSelect={onSelectTool}
        className="toolbar-tools"
        orientation="vertical"
        buttonClassName="toolbar-icon-btn"
        renderItem={(entry) => (
          <>
            <span
              className="toolbar-sprite toolbar3-sprite"
              style={{ "--sprite-index": entry.spriteIndex } as CSSProperties}
              aria-hidden
            />
            <span className="sr-only">{entry.label}</span>
          </>
        )}
      />
      <div className="toolbar-tools">
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite toolbar3-sprite" style={{ "--sprite-index": 11 } as CSSProperties} aria-hidden />
            <span className="sr-only">Zoom in</span>
          </span>
        </button>
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite toolbar3-sprite" style={{ "--sprite-index": 12 } as CSSProperties} aria-hidden />
            <span className="sr-only">Zoom out</span>
          </span>
        </button>
      </div>
    </header>
  );
}

type EditorToolbarProps = {
  onReprepareAndGenerate?: () => void;
};

export function EditorToolbar({ onReprepareAndGenerate }: EditorToolbarProps) {
  const { tool, setTool, openCellTemplateDialog, openHexTemplateDialog, zoomViewport } = useGraphStore();

  return (
    <EditorToolbarView
      tool={tool}
      onSelectTool={setTool}
      onAddCellGraph={openCellTemplateDialog}
      onAddHexGraph={openHexTemplateDialog}
      onReprepareAndGenerate={onReprepareAndGenerate ?? (() => {})}
      onZoomIn={() => zoomViewport(1.25)}
      onZoomOut={() => zoomViewport(1 / 1.25)}
    />
  );
}

function isSeparator(entry: ToolEntry | MfcToolbarSeparator): entry is MfcToolbarSeparator {
  return "kind" in entry && entry.kind === "separator";
}
