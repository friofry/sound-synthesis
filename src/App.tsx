import { useMemo, useState } from "react";
import "./App.css";
import { MfcMenuBar, type MfcMenuBarItem } from "./components/ui/MfcMenu";
import { MembraneModellerPage } from "./pages/MembraneModellerPage";
import { PianoPlayerPage } from "./pages/PianoPlayerPage";
import { useGraphStore } from "./store/graphStore";

type AppTab = "modeller" | "piano";

function App() {
  const [tab, setTab] = useState<AppTab>("modeller");
  const openInsertDialog = useGraphStore((s) => s.openInsertDialog);
  const openCellTemplateDialog = useGraphStore((s) => s.openCellTemplateDialog);
  const openHexTemplateDialog = useGraphStore((s) => s.openHexTemplateDialog);
  const zoomViewport = useGraphStore((s) => s.zoomViewport);
  const resetViewport = useGraphStore((s) => s.resetViewport);

  const menuItems = useMemo<MfcMenuBarItem[]>(
    () => [
      {
        id: "file",
        label: "File",
        items: [
          { id: "new", label: "New", shortcut: "Ctrl+N", disabled: true },
          { id: "open", label: "Open...", shortcut: "Ctrl+O", disabled: true },
          { id: "save", label: "Save", shortcut: "Ctrl+S", disabled: true },
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
            onClick: () => setTab("modeller"),
          },
          {
            id: "show-piano-player",
            label: "Piano Player",
            disabled: tab === "piano",
            onClick: () => setTab("piano"),
          },
        ],
      },
      {
        id: "graph",
        label: "Graph",
        items: [
          { id: "insert-graph", label: "Insert Graph...", onClick: openInsertDialog },
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
    [openCellTemplateDialog, openHexTemplateDialog, openInsertDialog, resetViewport, tab, zoomViewport],
  );

  return (
    <main className="app-shell">
      <MfcMenuBar items={menuItems} className="menu-bar" />
      <section className="app-content">{tab === "modeller" ? <MembraneModellerPage /> : <PianoPlayerPage />}</section>
    </main>
  );
}

export default App;
