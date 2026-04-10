import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import "./App.css";
import { MfcMenuBar, type MfcMenuBarItem } from "./components/ui/MfcMenu";
import { MembraneModellerPage } from "./pages/MembraneModellerPage";
import { PianoPlayerPage } from "./pages/PianoPlayerPage";
import { FrequencyAnalyzerPage } from "./pages/FrequencyAnalyzerPage";
import { graphFromBinary, graphToBinary } from "./engine/fileIO/graphFile";
import { useGraphStore } from "./store/graphStore";

type AppTab = "modeller" | "piano" | "frequency-analyzer";

function App() {
  const [tab, setTab] = useState<AppTab>("modeller");
  const graphInputRef = useRef<HTMLInputElement | null>(null);
  const openInsertDialog = useGraphStore((s) => s.openInsertDialog);
  const openCellTemplateDialog = useGraphStore((s) => s.openCellTemplateDialog);
  const openHexTemplateDialog = useGraphStore((s) => s.openHexTemplateDialog);
  const openCommunityGraphsDialog = useGraphStore((s) => s.openCommunityGraphsDialog);
  const zoomViewport = useGraphStore((s) => s.zoomViewport);
  const resetViewport = useGraphStore((s) => s.resetViewport);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const serializeGraph = useGraphStore((s) => s.serializeGraph);

  const handleOpenGraph = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    if (!file) {
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      loadGraph(graphFromBinary(buffer));
    } catch (error) {
      window.alert(`Failed to load graph file: ${(error as Error).message}`);
    } finally {
      event.target.value = "";
    }
  };

  const handleSaveGraph = useCallback(() => {
    try {
      const serializedGraph = serializeGraph();
      downloadGraphFile("graph.gph", graphToBinary(serializedGraph));
    } catch (error) {
      window.alert(`Failed to save graph file: ${(error as Error).message}`);
    }
  }, [serializeGraph]);

  const openModeller = useCallback(() => {
    setTab("modeller");
  }, []);

  const openPianoPlayer = useCallback(() => {
    setTab("piano");
  }, []);

  const openFrequencyAnalyzer = useCallback(() => {
    setTab("frequency-analyzer");
  }, []);

  const menuItems = useMemo<MfcMenuBarItem[]>(
    () => [
      {
        id: "file",
        label: "File",
        items: [
          { id: "new", label: "New", shortcut: "Ctrl+N", onClick: clearGraph },
          { id: "open", label: "Open...", shortcut: "Ctrl+O", onClick: () => graphInputRef.current?.click() },
          { id: "save", label: "Save", shortcut: "Ctrl+S", onClick: handleSaveGraph },
          { kind: "separator", id: "file-sep-1" },
          { id: "exit", label: "Exit", disabled: true },
        ],
      },
      {
        id: "edit",
        label: "Edit",
        items: [
          { id: "undo", label: "Undo", shortcut: "Ctrl+Z", disabled: true },
          { id: "redo", label: "Redo", shortcut: "Ctrl+Y", disabled: true },
          { kind: "separator", id: "edit-sep-1" },
          { id: "cut", label: "Cut", shortcut: "Ctrl+X", disabled: true },
          { id: "copy", label: "Copy", shortcut: "Ctrl+C", disabled: true },
          { id: "paste", label: "Paste", shortcut: "Ctrl+V", disabled: true },
        ],
      },
      {
        id: "view",
        label: "View",
        items: [
          { id: "zoom-in", label: "Zoom In", shortcut: "Ctrl+Plus", onClick: () => zoomViewport(1.25) },
          { id: "zoom-out", label: "Zoom Out", shortcut: "Ctrl+Minus", onClick: () => zoomViewport(1 / 1.25) },
          { id: "reset-view", label: "Reset View", onClick: resetViewport },
        ],
      },
      {
        id: "window",
        label: "Window",
        items: [
          {
            id: "show-modeller",
            label: "Membrane Modeller",
            disabled: tab === "modeller",
            onClick: openModeller,
          },
          {
            id: "show-piano-player",
            label: "Piano Player",
            disabled: tab === "piano",
            onClick: openPianoPlayer,
          },
          { kind: "separator", id: "window-sep-1" },
          {
            id: "show-frequency-analyzer",
            label: "Frequency Analyzer",
            disabled: tab === "frequency-analyzer",
            onClick: openFrequencyAnalyzer,
          },
        ],
      },
      {
        id: "graph",
        label: "Graph",
        items: [
          { id: "insert-graph", label: "Insert Graph...", onClick: openInsertDialog },
          { id: "browse-community-graphs", label: "Community graphs...", onClick: openCommunityGraphsDialog },
          { kind: "separator", id: "graph-sep-1" },
          { id: "cell-template", label: "Cell Template...", onClick: openCellTemplateDialog },
          { id: "hex-template", label: "Hex Template...", onClick: openHexTemplateDialog },
        ],
      },
      {
        id: "help",
        label: "Help",
        items: [
          {
            id: "documentation",
            label: "Documentation",
            onClick: () => window.open("http://swsoft.nsu.ru/~iivanov/", "_blank", "noopener,noreferrer"),
          },
          { kind: "separator", id: "help-sep-0" },
          {
            id: "contribute",
            label: "Contribute",
            onClick: () => window.open("https://github.com/friofry/sound-synthesis", "_blank", "noopener,noreferrer"),
          },
          { kind: "separator", id: "help-sep-1" },
          { id: "about", label: "About", disabled: true },
        ],
      },
    ],
    [
      clearGraph,
      handleSaveGraph,
      openCellTemplateDialog,
      openCommunityGraphsDialog,
      openFrequencyAnalyzer,
      openHexTemplateDialog,
      openInsertDialog,
      openModeller,
      openPianoPlayer,
      resetViewport,
      tab,
      zoomViewport,
    ],
  );

  return (
    <main className="app-shell">
      <MfcMenuBar items={menuItems} className="menu-bar" />
      <section className="app-content">
        <div className={`app-page ${tab === "modeller" ? "" : "is-hidden"}`}>
          <MembraneModellerPage onOpenPianoPlayer={openPianoPlayer} onOpenFrequencyAnalyzer={openFrequencyAnalyzer} />
        </div>
        <div className={`app-page ${tab === "piano" ? "" : "is-hidden"}`}>
          <PianoPlayerPage onBackToModeller={openModeller} />
        </div>
        <div className={`app-page ${tab === "frequency-analyzer" ? "" : "is-hidden"}`}>
          <FrequencyAnalyzerPage onBack={() => setTab("modeller")} />
        </div>
      </section>
      <input
        ref={graphInputRef}
        type="file"
        accept=".gph,application/octet-stream"
        className="hidden-input"
        onChange={handleOpenGraph}
      />
    </main>
  );
}

export default App;

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
