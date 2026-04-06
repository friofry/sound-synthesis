import { useCallback, useEffect, useRef } from "react";
import { EditorToolbar } from "../components/GraphEditor/EditorToolbar";
import { GraphCanvas } from "../components/GraphEditor/GraphCanvas";
import { StatusBar } from "../components/GraphEditor/StatusBar";
import { DotPropertiesDialog } from "../components/GraphEditor/dialogs/DotPropertiesDialog";
import { GroupModifyDialog } from "../components/GraphEditor/dialogs/GroupModifyDialog";
import { CellTemplateDialog } from "../components/GraphEditor/dialogs/CellTemplateDialog";
import { HexTemplateDialog } from "../components/GraphEditor/dialogs/HexTemplateDialog";
import { InsertGraphDialog } from "../components/GraphEditor/dialogs/InsertGraphDialog";
import { LinePropertiesDialog } from "../components/GraphEditor/dialogs/LinePropertiesDialog";
import { SimulationDialog } from "../components/GraphEditor/dialogs/SimulationDialog";
import { MembraneViewer } from "../components/Viewer3D/MembraneViewer";
import { ViewerControls } from "../components/Viewer3D/ViewerControls";
import { GenerationProgressDialog } from "../components/PianoPlayer/GenerationProgressDialog";
import { GenerateNotesDialog } from "../components/PianoPlayer/GenerateNotesDialog";
import { PianoKeyboard } from "../components/PianoPlayer/PianoKeyboard";
import { PianoToolbar } from "../components/PianoPlayer/PianoToolbar";
import { OscillogramView } from "../components/PianoPlayer/OscillogramView";
import { FrequencyAnalyzer } from "../components/PianoPlayer/FrequencyAnalyzer";
import { MfcSplitView } from "../components/ui/MfcSplitView";
import type { DistributionMode } from "../components/GraphEditor/dialogs/GroupModifyDialog";
import type { GridType, StiffnessType } from "../engine/types";
import { useGraphStore } from "../store/graphStore";
import { usePianoToolbar } from "../hooks/usePianoToolbar";

export function MembraneModellerPage() {
  const fuzzyGraphInitializedRef = useRef(false);
  const {
    simulationResult,
    simulationParams,
    graph,
    insertDialog,
    canvasSize,
    closeInsertDialog,
  } = useGraphStore();

  const {
    noteCount,
    pressedKeys,
    activeBuffer,
    activeSampleRate,
    recording,
    audioEngine,
    handlePressKey,
    handleReleaseKey,
    handleGenerateOne,
    generateInstrument,
    generateNotesDialogOpen,
    generateNotesSettings,
    isGeneratingInstrument,
    generationProgressDialogOpen,
    instrumentGenerationProgress,
    instrumentGenerationLabel,
    closeGenerateNotesDialog,
    closeGenerationProgressDialog,
    handleConfirmGenerateNotes,
    handleToggleRecording,
    handleSaveInstrument,
    handleLoadInstrumentFile,
    handleSaveSnc,
    handleLoadSncFile,
  } = usePianoToolbar({ graph, simulationParams });

  const InitializeFuzzyGraph = useCallback(() => {
    const graphTypes: GridType[] = ["cell", "triangle", "astra", "hexagon"];
    const randomGraphType = graphTypes[randomInt(0, graphTypes.length - 1)];
    const randomSize = randomInt(30, 50);
    const randomStiffness = randomFloat(0.5, 2.5);
    const randomAmplitude = randomFloat(0.5, 1);
    const randomStiffnessType: StiffnessType = Math.random() < 0.5 ? "tetradic" : "isotropic";
    const distribution: DistributionMode = "smoothed";

    const initialState = useGraphStore.getState();
    const width = Math.max(1, initialState.canvasSize.width);
    const height = Math.max(1, initialState.canvasSize.height);

    initialState.setDefaults({
      fixedBorder: true,
      stiffnessType: randomStiffnessType,
      defaultStiffness: randomStiffness,
    });

    initialState.createPresetGraph(randomGraphType, {
      n: randomSize,
      m: randomSize,
      layers: randomSize,
      stiffness: randomStiffness,
      weight: initialState.defaultWeight,
      fixedBorder: true,
      stiffnessType: randomStiffnessType,
      width,
      height,
    });

    const stateAfterCreate = useGraphStore.getState();
    const generatedGraph = stateAfterCreate.graph;
    if (!generatedGraph.dots.length) {
      return;
    }

    const bounds = generatedGraph.dots.reduce(
      (acc, dot) => ({
        minX: Math.min(acc.minX, dot.x),
        maxX: Math.max(acc.maxX, dot.x),
        minY: Math.min(acc.minY, dot.y),
        maxY: Math.max(acc.maxY, dot.y),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const centerDotIndex = generatedGraph.dots.reduce(
      (best, dot, idx) => {
        if (dot.fixed) {
          return best;
        }

        const distance = Math.hypot(dot.x - centerX, dot.y - centerY);
        return distance < best.distance ? { idx, distance } : best;
      },
      { idx: -1, distance: Number.POSITIVE_INFINITY },
    ).idx;

    if (centerDotIndex >= 0) {
      stateAfterCreate.setPlayingPoint(centerDotIndex);
    }

    const areaRatio = Math.sqrt(0.5);
    const rectWidth = (bounds.maxX - bounds.minX) * areaRatio;
    const rectHeight = (bounds.maxY - bounds.minY) * areaRatio;
    const rect = {
      x1: centerX - rectWidth / 2,
      y1: centerY - rectHeight / 2,
      x2: centerX + rectWidth / 2,
      y2: centerY + rectHeight / 2,
    };

    stateAfterCreate.updateGraph((next) => {
      const cx = (rect.x1 + rect.x2) / 2;
      const cy = (rect.y1 + rect.y2) / 2;
      const radius = Math.max(1, Math.hypot(rect.x2 - cx, rect.y2 - cy));

      const selected = next.dots
        .map((dot, idx) => ({ dot, idx }))
        .filter(
          ({ dot }) =>
            dot.x >= Math.min(rect.x1, rect.x2) &&
            dot.x <= Math.max(rect.x1, rect.x2) &&
            dot.y >= Math.min(rect.y1, rect.y2) &&
            dot.y <= Math.max(rect.y1, rect.y2),
        );

      selected.forEach(({ dot, idx }) => {
        const dist = Math.hypot(dot.x - cx, dot.y - cy);
        const factor = distribution === "smoothed" ? Math.max(0, 1 - dist / radius) : 1;
        next.setDotProps(idx, {
          u: randomAmplitude * factor,
          weight: stateAfterCreate.defaultWeight * Math.max(0.1, factor),
          fixed: dot.fixed,
        });
      });
    });
  }, []);

  useEffect(() => {
    if (fuzzyGraphInitializedRef.current) {
      return;
    }
    fuzzyGraphInitializedRef.current = true;
    InitializeFuzzyGraph();
  }, [InitializeFuzzyGraph]);

  return (
    <section className="workspace-layout">
      <MfcSplitView className="workspace-split-view" defaultRatio={0.5} minPaneSize={280}>
        <section className="graph-pane">
          <section className="graph-pane-inner">
            <aside className="tool-column">
              <EditorToolbar />
            </aside>
            <div className="graph-stage">
              <GraphCanvas />
              <StatusBar />
            </div>
          </section>
        </section>
        <MfcSplitView
          orientation="vertical"
          className="right-column modeller-right-column"
          defaultRatios={[0.5, 0.125, 0.125, 0.25]}
          minPaneSize={80}
        >
          <section className="right-panel viewer-panel">
            <ViewerControls />
            <MembraneViewer />
          </section>
          <section className="right-panel oscill-panel">
            <OscillogramView
              buffer={activeBuffer ?? simulationResult?.playingPointBuffer ?? null}
              sampleRate={activeSampleRate || simulationParams.sampleRate}
              compact
            />
          </section>
          <section className="right-panel frequency-panel">
            <FrequencyAnalyzer
              analyser={audioEngine.analyser}
              buffer={activeBuffer ?? simulationResult?.playingPointBuffer ?? null}
              sampleRate={activeSampleRate || simulationParams.sampleRate}
            />
          </section>
          <section className="right-panel piano-panel">
            <PianoToolbar
              recording={recording}
              onGenerateOne={handleGenerateOne}
              onGenerateInstrument={generateInstrument}
              onToggleRecording={handleToggleRecording}
              onSaveInstrument={handleSaveInstrument}
              onLoadInstrumentFile={handleLoadInstrumentFile}
              onSaveSnc={handleSaveSnc}
              onLoadSncFile={handleLoadSncFile}
            />
            <GenerateNotesDialog
              open={generateNotesDialogOpen}
              initialValues={generateNotesSettings}
              onClose={closeGenerateNotesDialog}
              onSubmit={handleConfirmGenerateNotes}
            />
            <GenerationProgressDialog
              open={isGeneratingInstrument && generationProgressDialogOpen}
              progress={instrumentGenerationProgress}
              label={instrumentGenerationLabel}
              onClose={closeGenerationProgressDialog}
            />
            <PianoKeyboard
              noteCount={noteCount}
              pressedKeys={pressedKeys}
              onPressKey={handlePressKey}
              onReleaseKey={handleReleaseKey}
            />
          </section>
        </MfcSplitView>
      </MfcSplitView>
      <SimulationDialog />
      <DotPropertiesDialog />
      <LinePropertiesDialog />
      <GroupModifyDialog />
      <CellTemplateDialog />
      <HexTemplateDialog />
      <InsertGraphDialog open={insertDialog.open} canvasSize={canvasSize} onClose={closeInsertDialog} />
    </section>
  );
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
