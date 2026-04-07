import { useRef, type ChangeEvent, type CSSProperties } from "react";
import { graphFromBinary, graphToBinary } from "../../engine/fileIO/graphFile";
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
  { id: "drag-point", spriteIndex: 1, label: "Drag point", implemented: true },
  { id: "drag-viewport", spriteIndex: 2, label: "Drag viewport", implemented: true },
  { kind: "separator", id: "sep-1" },
  { id: "modify-point", spriteIndex: 3, label: "Modify point", implemented: true },
  { id: "modify-link", spriteIndex: 4, label: "Modify link", implemented: true },
  { kind: "separator", id: "sep-2" },
  { id: "delete-point", spriteIndex: 5, label: "Delete point", implemented: true },
  { id: "delete-link", spriteIndex: 6, label: "Delete link", implemented: true },
  { kind: "separator", id: "sep-3" },
  {
    id: "add-point-link",
    spriteIndex: 7,
    label: "Add point/link",
    implemented: true,
    description:
      "Click a point, then click another point to link them. Click empty space to add a new point. To add a point into an existing group, click inside the group bounding box.",
  },
  { kind: "separator", id: "sep-4" },
];

const EXTRA_TOOLS: Array<ToolEntry | MfcToolbarSeparator> = [
  { id: "playing-point", spriteIndex: 10, label: "Playing point", implemented: true },
  { id: "modify-group", spriteIndex: 11, label: "Modify group", implemented: true },
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
  onToggleHammerTool: () => void;
  onAddCellGraph: () => void;
  onAddHexGraph: () => void;
  onReprepareAndGenerate: () => void;
  onNewGraph: () => void;
  onLoadGraphFile: (file: File) => void | Promise<void>;
  onSaveGraph: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function EditorToolbarView({
  tool,
  onSelectTool,
  onToggleHammerTool,
  onAddCellGraph,
  onAddHexGraph,
  onReprepareAndGenerate,
  onNewGraph,
  onLoadGraphFile,
  onSaveGraph,
  onZoomIn,
  onZoomOut,
}: EditorToolbarViewProps) {
  const graphInputRef = useRef<HTMLInputElement | null>(null);

  const handleGraphChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    if (file) {
      await onLoadGraphFile(file);
    }
    event.target.value = "";
  };

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
            <span
              className="toolbar-sprite editor-toolbar-sprite"
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
          onClick={onAddCellGraph}
          title="Add cell graph"
          aria-label="Add cell graph"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite editor-toolbar-sprite" style={{ "--sprite-index": 8 } as CSSProperties} aria-hidden />
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
            <span className="toolbar-sprite editor-toolbar-sprite" style={{ "--sprite-index": 9 } as CSSProperties} aria-hidden />
            <span className="sr-only">Add hexagonal graph</span>
          </span>
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
              className="toolbar-sprite editor-toolbar-sprite"
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
            <span className="toolbar-sprite editor-toolbar-sprite" style={{ "--sprite-index": 13 } as CSSProperties} aria-hidden />
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
            <span className="toolbar-sprite editor-toolbar-sprite" style={{ "--sprite-index": 14 } as CSSProperties} aria-hidden />
            <span className="sr-only">Zoom out</span>
          </span>
        </button>
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onNewGraph}
          title="New: Clears the editor screen."
          aria-label="New graph"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite editor-toolbar-sprite" style={{ "--sprite-index": 15 } as CSSProperties} aria-hidden />
            <span className="sr-only">New graph</span>
          </span>
        </button>
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={() => graphInputRef.current?.click()}
          title="Load graph file (.gph)"
          aria-label="Load graph"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite editor-toolbar-sprite" style={{ "--sprite-index": 16 } as CSSProperties} aria-hidden />
            <span className="sr-only">Load graph</span>
          </span>
        </button>
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onSaveGraph}
          title="Save graph file (.gph)"
          aria-label="Save graph"
        >
          <span className="mfc-toolbar-button-content">
            <span className="toolbar-sprite editor-toolbar-sprite" style={{ "--sprite-index": 17 } as CSSProperties} aria-hidden />
            <span className="sr-only">Save graph</span>
          </span>
        </button>
        <button
          type="button"
          className={`mfc-toolbar-button toolbar-icon-btn ${tool === "hammer" ? "is-selected" : ""}`.trim()}
          onClick={onToggleHammerTool}
          title="Hammer tool"
          aria-label="Hammer tool"
          aria-pressed={tool === "hammer"}
        >
          <span className="mfc-toolbar-button-content">
            <span aria-hidden>🔨</span>
            <span className="sr-only">Hammer tool</span>
          </span>
        </button>
        <button
          type="button"
          className="mfc-toolbar-button toolbar-icon-btn"
          onClick={onReprepareAndGenerate}
          title="Random preset + generate octaves (2)"
          aria-label="Random preset + generate octaves (2)"
        >
          <span className="mfc-toolbar-button-content">
            <span aria-hidden>🎲</span>
            <span className="sr-only">Random preset + generate octaves (2)</span>
          </span>
        </button>
      </div>
      <input
        ref={graphInputRef}
        type="file"
        accept=".gph,application/octet-stream"
        className="hidden-input"
        onChange={handleGraphChange}
      />
    </header>
  );
}

type EditorToolbarProps = {
  onReprepareAndGenerate?: () => void;
};

export function EditorToolbar({ onReprepareAndGenerate }: EditorToolbarProps) {
  const {
    tool,
    setTool,
    openCellTemplateDialog,
    openHexTemplateDialog,
    openHammerDialog,
    zoomViewport,
    clearGraph,
    serializeGraph,
    loadGraph,
  } = useGraphStore();

  const handleNewGraph = () => {
    clearGraph();
  };

  const handleLoadGraphFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      loadGraph(graphFromBinary(buffer));
    } catch (error) {
      window.alert(`Failed to load graph file: ${(error as Error).message}`);
    }
  };

  const handleSaveGraph = () => {
    try {
      const serializedGraph = serializeGraph();
      downloadGraphFile("graph.gph", graphToBinary(serializedGraph));
    } catch (error) {
      window.alert(`Failed to save graph file: ${(error as Error).message}`);
    }
  };

  return (
    <EditorToolbarView
      tool={tool}
      onSelectTool={(nextTool) => {
        setTool(nextTool);
        if (nextTool === "hammer") {
          openHammerDialog();
        }
      }}
      onToggleHammerTool={() => {
        setTool("hammer");
        openHammerDialog();
      }}
      onAddCellGraph={openCellTemplateDialog}
      onAddHexGraph={openHexTemplateDialog}
      onReprepareAndGenerate={onReprepareAndGenerate ?? (() => {})}
      onNewGraph={handleNewGraph}
      onLoadGraphFile={handleLoadGraphFile}
      onSaveGraph={handleSaveGraph}
      onZoomIn={() => zoomViewport(1.25)}
      onZoomOut={() => zoomViewport(1 / 1.25)}
    />
  );
}

function isSeparator(entry: ToolEntry | MfcToolbarSeparator): entry is MfcToolbarSeparator {
  return "kind" in entry && entry.kind === "separator";
}

function downloadGraphFile(filename: string, buffer: ArrayBuffer): void {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
