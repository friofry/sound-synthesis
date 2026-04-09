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
import { CommunityGraphsDialog } from "../components/GraphEditor/dialogs/CommunityGraphsDialog";
import { HammerDialog } from "../components/GraphEditor/dialogs/HammerDialog";
import { MembraneViewer } from "../components/Viewer3D/MembraneViewer";
import { GenerationProgressDialog } from "../components/PianoPlayer/GenerationProgressDialog";
import { GenerateNotesDialog } from "../components/PianoPlayer/GenerateNotesDialog";
import { PianoKeyboard } from "../components/PianoPlayer/PianoKeyboard";
import { PianoToolbar } from "../components/PianoPlayer/PianoToolbar";
import { LegacyOscillogrammWaveform } from "../components/PianoPlayer/LegacyOscillogrammWaveform";
import { LegacyOscillogrammSpectrum } from "../components/PianoPlayer/LegacyOscillogrammSpectrum";
import { MfcSplitView } from "../components/ui/MfcSplitView";
import { graphFromBinary } from "../engine/fileIO/graphFile";
import type {
  BoundaryMode,
  GridType,
  StiffnessNormalizationMode,
  StiffnessType,
  WeightDistributionMode,
} from "../engine/types";
import type { DistributionMode } from "../engine/presetGraphPreparation";
import {
  DEFAULT_SIMULATION_BACKEND,
  DEFAULT_SIMULATION_METHOD,
  DEFAULT_SIMULATION_PRECISION,
  DEFAULT_SIMULATION_SUBSTEPS,
  DEFAULT_SIMULATION_SUBSTEPS_MODE,
} from "../engine/simulationDefaults";
import { useGraphStore } from "../store/graphStore";
import { useMembraneViewerStore } from "../store/membraneViewerStore";
import { usePianoToolbar } from "../hooks/usePianoToolbar";
import { useViewerStore } from "../store/viewerStore";

export function MembraneModellerPage() {
  const skipAutoRandomInit = import.meta.env.VITE_E2E === "1";
  const fuzzyGraphInitializedRef = useRef(false);
  const {
    simulationParams,
    graph,
    insertDialog,
    communityGraphsDialog,
    canvasSize,
    closeInsertDialog,
    closeCommunityGraphsDialog,
    createPresetGraph,
    loadGraph,
    setDefaults,
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
    handlePlayPreviewBuffer,
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
    const randomPreset = createRandomPresetConfig();

    const initialState = useGraphStore.getState();
    const width = Math.max(1, initialState.canvasSize.width);
    const height = Math.max(1, initialState.canvasSize.height);

    initialState.setDefaults({
      fixedBorder: randomPreset.boundaryMode === "fixed",
      boundaryMode: randomPreset.boundaryMode,
      stiffnessType: randomPreset.stiffnessType,
      defaultStiffness: randomPreset.stiffness,
      stiffnessNormalizationMode: randomPreset.stiffnessNormalizationMode,
      weightDistributionMode: randomPreset.weightDistributionMode,
      rimWeightRatio: randomPreset.rimWeightRatio,
      rimDampingFactor: randomPreset.rimDampingFactor,
    });

    initialState.createPresetGraph(randomPreset.graphType, {
      n: randomPreset.size,
      m: randomPreset.size,
      layers: randomPreset.size,
      stiffness: randomPreset.stiffness,
      weight: initialState.defaultWeight,
      fixedBorder: randomPreset.boundaryMode === "fixed",
      stiffnessType: randomPreset.stiffnessType,
      boundaryMode: randomPreset.boundaryMode,
      stiffnessNormalizationMode: randomPreset.stiffnessNormalizationMode,
      weightDistributionMode: randomPreset.weightDistributionMode,
      rimWeightRatio: randomPreset.rimWeightRatio,
      rimDampingFactor: randomPreset.rimDampingFactor,
      width,
      height,
    }, {
      playingPointMode: "center",
      centerGroup: {
        enabled: true,
        maxAmplitude: randomPreset.amplitude,
        maxWeight: initialState.defaultWeight,
        stiffness: randomPreset.stiffness,
        distribution: randomPreset.centerDistribution,
        fixMode: "none",
        radiusRatio: randomPreset.centerGroupRadiusRatio,
      },
    });
    initialState.setTool("hammer");
    const preparedGraph = useGraphStore.getState().graph.clone();
    void handleConfirmGenerateNotes({
      octaves: 2,
      attenuation: generateNotesSettings.attenuation,
      squareAttenuation: generateNotesSettings.squareAttenuation,
      durationMs: 150,
      tillSilence: false,
      sampleRate: 44100,
      method: DEFAULT_SIMULATION_METHOD,
      backend: DEFAULT_SIMULATION_BACKEND,
      precision: DEFAULT_SIMULATION_PRECISION,
      substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
      substeps: DEFAULT_SIMULATION_SUBSTEPS,
    }, preparedGraph);
  }, [
    generateNotesSettings.attenuation,
    generateNotesSettings.squareAttenuation,
    handleConfirmGenerateNotes,
  ]);

  useEffect(() => {
    if (skipAutoRandomInit) {
      return;
    }
    if (fuzzyGraphInitializedRef.current) {
      return;
    }
    fuzzyGraphInitializedRef.current = true;
    InitializeFuzzyGraph();
  }, [InitializeFuzzyGraph, skipAutoRandomInit]);

  const handleReprepareAndGenerate = useCallback(() => {
    const randomPreset = createRandomPresetConfig();
    const currentState = useGraphStore.getState();
    const width = Math.max(1, currentState.canvasSize.width);
    const height = Math.max(1, currentState.canvasSize.height);

    setDefaults({
      fixedBorder: randomPreset.boundaryMode === "fixed",
      boundaryMode: randomPreset.boundaryMode,
      stiffnessType: randomPreset.stiffnessType,
      defaultStiffness: randomPreset.stiffness,
      stiffnessNormalizationMode: randomPreset.stiffnessNormalizationMode,
      weightDistributionMode: randomPreset.weightDistributionMode,
      rimWeightRatio: randomPreset.rimWeightRatio,
      rimDampingFactor: randomPreset.rimDampingFactor,
    });

    createPresetGraph(randomPreset.graphType, {
      n: randomPreset.size,
      m: randomPreset.size,
      layers: randomPreset.size,
      stiffness: randomPreset.stiffness,
      weight: currentState.defaultWeight,
      fixedBorder: randomPreset.boundaryMode === "fixed",
      stiffnessType: randomPreset.stiffnessType,
      boundaryMode: randomPreset.boundaryMode,
      stiffnessNormalizationMode: randomPreset.stiffnessNormalizationMode,
      weightDistributionMode: randomPreset.weightDistributionMode,
      rimWeightRatio: randomPreset.rimWeightRatio,
      rimDampingFactor: randomPreset.rimDampingFactor,
      width,
      height,
    }, {
      playingPointMode: "center",
      centerGroup: {
        enabled: true,
        maxAmplitude: randomPreset.amplitude,
        maxWeight: currentState.defaultWeight,
        stiffness: randomPreset.stiffness,
        distribution: randomPreset.centerDistribution,
        fixMode: "none",
        radiusRatio: randomPreset.centerGroupRadiusRatio,
      },
    });
    currentState.setTool("hammer");

    const preparedGraph = useGraphStore.getState().graph.clone();
    void handleConfirmGenerateNotes({
      octaves: 2,
      attenuation: generateNotesSettings.attenuation,
      squareAttenuation: generateNotesSettings.squareAttenuation,
      durationMs: 150,
      tillSilence: false,
      sampleRate: 44100,
      method: DEFAULT_SIMULATION_METHOD,
      backend: DEFAULT_SIMULATION_BACKEND,
      precision: DEFAULT_SIMULATION_PRECISION,
      substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
      substeps: DEFAULT_SIMULATION_SUBSTEPS,
    }, preparedGraph);
  }, [
    createPresetGraph,
    generateNotesSettings.attenuation,
    generateNotesSettings.squareAttenuation,
    handleConfirmGenerateNotes,
    setDefaults,
  ]);

  const handleOpenCommunityGraph = useCallback(async (graphPath: string) => {
    const encodedPath = graphPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const response = await fetch(`/graphs/${encodedPath}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    loadGraph(graphFromBinary(buffer));
  }, [loadGraph]);

  const handleHammerImpactToViewer = useCallback((payload: {
    impactX: number;
    impactY: number;
    charge: number;
    settings: {
      distribution: "equivalent" | "smoothed";
      weight: number;
      velocity: number;
      restitution: number;
      radius: number;
    };
  }) => {
    const { setActiveSource, updateActiveSnapshotGraph } = useMembraneViewerStore.getState();
    const { resetFrame, play } = useViewerStore.getState();
    const radius = Math.max(1, payload.settings.radius);
    const sigma = Math.max(1, radius * 0.45);
    const effectiveVelocity = payload.settings.velocity * clamp(payload.charge, 0, 1);
    const restitution = clamp(payload.settings.restitution, 0, 1);
    const hammerMass = Math.max(0.000001, payload.settings.weight);

    setActiveSource("editor");
    updateActiveSnapshotGraph((nextGraph) => {
      for (let index = 0; index < nextGraph.dots.length; index += 1) {
        const dot = nextGraph.dots[index];
        if (!dot || dot.fixed) {
          continue;
        }
        const dist = Math.hypot(dot.x - payload.impactX, dot.y - payload.impactY);
        if (dist > radius) {
          continue;
        }
        const factor =
          payload.settings.distribution === "smoothed"
            ? Math.exp(-(dist * dist) / (2 * sigma * sigma))
            : 1;
        const dotMass = Math.max(0.000001, dot.weight);
        const impactVelocity =
          (((1 + restitution) * hammerMass) / (hammerMass + dotMass)) * effectiveVelocity * factor;
        const nextV = dot.v + impactVelocity;
        nextGraph.setDotProps(index, {
          u: dot.u,
          v: Math.max(-1, Math.min(1, nextV)),
        });
      }
    });
    resetFrame();
    play();
  }, []);

  return (
    <section className="workspace-layout">
      <MfcSplitView className="workspace-split-view" defaultRatio={0.5} minPaneSize={280}>
        <section className="graph-pane">
          <section className="graph-pane-inner">
            <aside className="tool-column">
              <EditorToolbar onReprepareAndGenerate={handleReprepareAndGenerate} />
            </aside>
            <div className="graph-stage">
              <GraphCanvas onHammerPreview={handlePlayPreviewBuffer} onHammerImpact={handleHammerImpactToViewer} />
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
            <MembraneViewer />
          </section>
          <section className="right-panel oscill-panel">
            <LegacyOscillogrammWaveform
              buffer={activeBuffer}
              sampleRate={activeSampleRate || simulationParams.sampleRate}
            />
          </section>
          <section className="right-panel frequency-panel">
            <LegacyOscillogrammSpectrum
              analyser={audioEngine.analyser}
              buffer={activeBuffer}
              sampleRate={activeSampleRate || simulationParams.sampleRate}
              compact
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
      <HammerDialog />
      <CellTemplateDialog />
      <HexTemplateDialog />
      <InsertGraphDialog
        open={insertDialog.open}
        canvasSize={canvasSize}
        onGenerateOctaves123={(octaves) => {
          void handleConfirmGenerateNotes({
            octaves,
            attenuation: generateNotesSettings.attenuation,
            squareAttenuation: generateNotesSettings.squareAttenuation,
            durationMs: 150,
            tillSilence: false,
            sampleRate: 44100,
            method: DEFAULT_SIMULATION_METHOD,
            backend: DEFAULT_SIMULATION_BACKEND,
            precision: DEFAULT_SIMULATION_PRECISION,
            substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
            substeps: DEFAULT_SIMULATION_SUBSTEPS,
          });
        }}
        onClose={closeInsertDialog}
      />
      <CommunityGraphsDialog
        open={communityGraphsDialog.open}
        onClose={closeCommunityGraphsDialog}
        onOpenGraph={handleOpenCommunityGraph}
      />
    </section>
  );
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createRandomPresetConfig(): {
  graphType: GridType;
  size: number;
  stiffness: number;
  amplitude: number;
  centerGroupRadiusRatio: number;
  stiffnessType: StiffnessType;
  boundaryMode: BoundaryMode;
  stiffnessNormalizationMode: StiffnessNormalizationMode;
  weightDistributionMode: WeightDistributionMode;
  centerDistribution: DistributionMode;
  rimWeightRatio: number;
  rimDampingFactor: number;
} {
  const graphTypes: GridType[] = ["cell", "triangle", "astra", "hexagon", "disk-hex"];
  const boundaryModes: BoundaryMode[] = ["free", "fixed", "rim-damped", "rim-heavy"];
  const stiffnessNormalizationModes: StiffnessNormalizationMode[] = ["none", "by-edge-length", "by-rest-area"];
  const weightDistributionModes: WeightDistributionMode[] = ["uniform", "by-node-area", "edge-light"];
  const centerDistributions: DistributionMode[] = ["equivalent", "smoothed"];
  return {
    graphType: graphTypes[randomInt(0, graphTypes.length - 1)],
    size: randomInt(15, 50),
    stiffness: randomFloat(0.5, 5),
    amplitude: randomFloat(0.1, 0.8),
    centerGroupRadiusRatio: randomFloat(0.175, 0.475),
    stiffnessType: Math.random() < 0.5 ? "tetradic" : "isotropic",
    boundaryMode: boundaryModes[randomInt(0, boundaryModes.length - 1)],
    stiffnessNormalizationMode: stiffnessNormalizationModes[randomInt(0, stiffnessNormalizationModes.length - 1)],
    weightDistributionMode: weightDistributionModes[randomInt(0, weightDistributionModes.length - 1)],
    centerDistribution: centerDistributions[randomInt(0, centerDistributions.length - 1)],
    rimWeightRatio: randomFloat(1, 3),
    rimDampingFactor: randomFloat(0.05, 0.95),
  };
}
