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
import {
  DEFAULT_INITIAL_PRESET_GENERATION_SETTINGS,
  DEFAULT_INSERT_GRAPH_DIALOG_GENERATION_SETTINGS,
  DEFAULT_RANDOM_TOOL_GENERATION_SETTINGS,
} from "../config/defaults";
import { graphFromBinary } from "../engine/fileIO/graphFile";
import { createHammerToolPerturbation } from "../engine/hammerPerturbation";
import type {
  BoundaryMode,
  GridType,
  StiffnessNormalizationMode,
  StiffnessType,
  WeightDistributionMode,
} from "../engine/types";
import type { DistributionMode } from "../engine/presetGraphPreparation";
import { useGraphStore } from "../store/graphStore";
import { useMembraneViewerStore } from "../store/membraneViewerStore";
import { usePianoToolbar } from "../hooks/usePianoToolbar";
import { useViewerStore } from "../store/viewerStore";
import { useAudioAnalyserStore } from "../store/audioAnalyserStore";
import { e2eRecordHammerPreview, e2eSetLastHammerImpact, installE2EHarness } from "../e2e/e2eHarness";

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
    generateSingleNoteFromSource,
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

  const setAnalyser = useAudioAnalyserStore((s) => s.setAnalyser);
  useEffect(() => {
    setAnalyser(audioEngine.analyser);
    return () => setAnalyser(null);
  }, [audioEngine.analyser, setAnalyser]);

  const buildQuickGenerateSettings = useCallback(
    (
      defaults:
        | typeof DEFAULT_INITIAL_PRESET_GENERATION_SETTINGS
        | typeof DEFAULT_RANDOM_TOOL_GENERATION_SETTINGS
        | typeof DEFAULT_INSERT_GRAPH_DIALOG_GENERATION_SETTINGS,
      octaves: 1 | 2 | 3 = defaults.octaves,
    ) => ({
      ...defaults,
      octaves,
    }),
    [],
  );

  const InitializeFuzzyGraph = useCallback(() => {
    const randomPreset = createRandomPresetConfig();

    const initialState = useGraphStore.getState();
    const width = Math.max(1, initialState.canvasSize.width);
    const height = Math.max(1, initialState.canvasSize.height);

    initialState.setDefaults({
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
    void handleConfirmGenerateNotes(
      buildQuickGenerateSettings(DEFAULT_INITIAL_PRESET_GENERATION_SETTINGS),
      preparedGraph,
      { persistSettings: false },
    );
  }, [
    buildQuickGenerateSettings,
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

  useEffect(() => {
    installE2EHarness();
  }, []);

  const handleReprepareAndGenerate = useCallback(() => {
    const randomPreset = createRandomPresetConfig();
    const currentState = useGraphStore.getState();
    const width = Math.max(1, currentState.canvasSize.width);
    const height = Math.max(1, currentState.canvasSize.height);

    setDefaults({
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
    void handleConfirmGenerateNotes(
      buildQuickGenerateSettings(DEFAULT_RANDOM_TOOL_GENERATION_SETTINGS),
      preparedGraph,
      { persistSettings: false },
    );
  }, [
    buildQuickGenerateSettings,
    createPresetGraph,
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
      playingPointMode: "impact-point" | "graph-center";
    };
  }) => {
    e2eSetLastHammerImpact({
      impactX: payload.impactX,
      impactY: payload.impactY,
      charge: payload.charge,
      radius: payload.settings.radius,
    });
    const hammerPerturbation = createHammerToolPerturbation({
      graph,
      impactX: payload.impactX,
      impactY: payload.impactY,
      charge: payload.charge,
      settings: payload.settings,
    });
    const { initializeSource, setActiveSource } = useMembraneViewerStore.getState();
    const { resetFrame, play } = useViewerStore.getState();
    const { setToolPerturbation } = useGraphStore.getState();

    setToolPerturbation(hammerPerturbation);
    initializeSource("tool-preview", graph, {
      activate: true,
      force: true,
      perturbation: hammerPerturbation,
    });
    setActiveSource("tool-preview");
    resetFrame();
    play();

    void generateSingleNoteFromSource({
      sourceGraph: graph,
      perturbation: hammerPerturbation,
      autoplay: true,
      snapshotId: "tool-preview:latest",
    }).then((note) => {
      if (note) {
        e2eRecordHammerPreview(note.buffer, note.sampleRate);
      }
    });
  }, [generateSingleNoteFromSource, graph]);

  return (
    <section className="workspace-layout">
      <MfcSplitView className="workspace-split-view" defaultRatio={0.5} minPaneSize={280}>
        <section className="graph-pane">
          <section className="graph-pane-inner">
            <aside className="tool-column">
              <EditorToolbar onReprepareAndGenerate={handleReprepareAndGenerate} />
            </aside>
            <div className="graph-stage">
              <GraphCanvas onHammerImpact={handleHammerImpactToViewer} />
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
          void handleConfirmGenerateNotes(
            buildQuickGenerateSettings(DEFAULT_INSERT_GRAPH_DIALOG_GENERATION_SETTINGS, octaves),
            undefined,
            { persistSettings: false },
          );
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
  const boundaryModes: BoundaryMode[] = ["fixed"];
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
