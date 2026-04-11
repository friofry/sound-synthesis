import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import "./App.css";
import { MfcMenuBar, type MfcMenuBarItem } from "./components/ui/MfcMenu";
import { MembraneModellerPage } from "./pages/MembraneModellerPage";
import { PianoPlayerPage } from "./pages/PianoPlayerPage";
import { FrequencyAnalyzerPage } from "./pages/FrequencyAnalyzerPage";
import { graphFromBinary, graphToBinary } from "./engine/fileIO/graphFile";
import { buildSncPlaybackIntervals, scheduleSncPlaybackKeySimulation } from "./engine/snc/sncPlaybackKeys";
import { renderSncTextToWav } from "./engine/snc/renderSncFromText";
import { CommunitySncDialog } from "./components/PianoPlayer/CommunitySncDialog";
import { connectMelodyPreviewToAnalyser } from "./audio/melodyPreviewBridge";
import { useGraphStore } from "./store/graphStore";
import { usePianoStore } from "./store/pianoStore";

type AppTab = "modeller" | "piano" | "frequency-analyzer";

function App() {
  const [tab, setTab] = useState<AppTab>("modeller");
  const graphInputRef = useRef<HTMLInputElement | null>(null);
  const communitySncAudioRef = useRef<HTMLAudioElement | null>(null);
  const communitySncPlaybackCleanupRef = useRef<(() => void) | null>(null);
  const communitySncAnalyserDisconnectRef = useRef<(() => void) | null>(null);
  const openInsertDialog = useGraphStore((s) => s.openInsertDialog);
  const openCellTemplateDialog = useGraphStore((s) => s.openCellTemplateDialog);
  const openHexTemplateDialog = useGraphStore((s) => s.openHexTemplateDialog);
  const openCommunityGraphsDialog = useGraphStore((s) => s.openCommunityGraphsDialog);
  const zoomViewport = useGraphStore((s) => s.zoomViewport);
  const resetViewport = useGraphStore((s) => s.resetViewport);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const serializeGraph = useGraphStore((s) => s.serializeGraph);

  const communitySncDialogOpen = usePianoStore((s) => s.communitySncDialogOpen);
  const openCommunitySncDialog = usePianoStore((s) => s.openCommunitySncDialog);
  const closeCommunitySncDialog = usePianoStore((s) => s.closeCommunitySncDialog);
  const setLastSncText = usePianoStore((s) => s.setLastSncText);
  const setLastRenderedWav = usePianoStore((s) => s.setLastRenderedWav);
  const handleOpenCommunitySnc = useCallback(async (sncPath: string) => {
    const { instrumentNotes } = usePianoStore.getState();
    if (instrumentNotes.length === 0) {
      throw new Error("Generate or load an instrument first.");
    }
    const response = await fetch(`/snc/${encodeURIComponent(sncPath)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const { wavBlob } = renderSncTextToWav(text, instrumentNotes);
    setLastSncText(text);
    setLastRenderedWav(wavBlob);
    const url = URL.createObjectURL(wavBlob);
    const audio = new Audio(url);
    communitySncAnalyserDisconnectRef.current?.();
    communitySncAnalyserDisconnectRef.current = null;
    communitySncPlaybackCleanupRef.current?.();
    communitySncAudioRef.current?.pause();
    communitySncAudioRef.current = audio;
    communitySncAnalyserDisconnectRef.current = await connectMelodyPreviewToAnalyser(audio);
    const intervals = buildSncPlaybackIntervals(text, instrumentNotes);
    const { pressKey, releaseKey } = usePianoStore.getState();
    communitySncPlaybackCleanupRef.current = scheduleSncPlaybackKeySimulation(audio, intervals, pressKey, releaseKey);
    const cleanupPlayback = () => {
      communitySncAnalyserDisconnectRef.current?.();
      communitySncAnalyserDisconnectRef.current = null;
      communitySncPlaybackCleanupRef.current?.();
      communitySncPlaybackCleanupRef.current = null;
      if (communitySncAudioRef.current === audio) {
        communitySncAudioRef.current = null;
      }
      URL.revokeObjectURL(url);
    };
    audio.onended = cleanupPlayback;
    try {
      await audio.play();
    } catch (error) {
      cleanupPlayback();
      throw error;
    }
  }, [setLastRenderedWav, setLastSncText]);

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

  const TAB_CYCLE: AppTab[] = useMemo(() => ["modeller", "piano", "frequency-analyzer"], []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "1") {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (document.querySelector(".mfc-overlay")) {
        return;
      }
      event.preventDefault();
      setTab((current) => {
        const index = TAB_CYCLE.indexOf(current);
        return TAB_CYCLE[(index + 1) % TAB_CYCLE.length];
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [TAB_CYCLE]);

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
        id: "piano",
        label: "Piano",
        items: [{ id: "community-snc", label: "Community SNC...", onClick: openCommunitySncDialog }],
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
      openCommunitySncDialog,
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
        {tab === "modeller" ? (
          <div className="app-page">
            <MembraneModellerPage onOpenPianoPlayer={openPianoPlayer} onOpenFrequencyAnalyzer={openFrequencyAnalyzer} visible />
          </div>
        ) : null}
        {tab === "piano" ? (
          <div className="app-page">
            <PianoPlayerPage onBackToModeller={openModeller} visible />
          </div>
        ) : null}
        {tab === "frequency-analyzer" ? (
          <div className="app-page">
            <FrequencyAnalyzerPage onBack={() => setTab("modeller")} />
          </div>
        ) : null}
      </section>
      <input
        ref={graphInputRef}
        type="file"
        accept=".gph,application/octet-stream"
        className="hidden-input"
        onChange={handleOpenGraph}
      />
      <CommunitySncDialog
        open={communitySncDialogOpen}
        onClose={closeCommunitySncDialog}
        onOpenSnc={handleOpenCommunitySnc}
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
