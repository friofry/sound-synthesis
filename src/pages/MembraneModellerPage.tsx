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
} from "../config/defaults";
import { graphFromBinary } from "../engine/fileIO/graphFile";
import { createHammerToolPerturbation } from "../engine/hammerPerturbation";
import { createRandomPresetConfig, reprepareAndGenerateRandom } from "../graph/reprepareAndGenerateRandom";
import { useGraphStore } from "../store/graphStore";
import { useMembraneViewerStore } from "../store/membraneViewerStore";
import { usePianoToolbar } from "../hooks/usePianoToolbar";
import { useViewerStore } from "../store/viewerStore";
import { useAudioAnalyserStore } from "../store/audioAnalyserStore";
import { e2eRecordHammerPreview, e2eSetLastHammerImpact, installE2EHarness } from "../e2e/e2eHarness";

type MembraneModellerPageProps = {
  onOpenPianoPlayer: () => void;
  onOpenFrequencyAnalyzer: () => void;
  visible?: boolean;
};

export function MembraneModellerPage({ onOpenPianoPlayer, onOpenFrequencyAnalyzer, visible = true }: MembraneModellerPageProps) {
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
    loadGraph,
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
    handlePlayPopcornSnc,
  } = usePianoToolbar({ graph, simulationParams });

  const setAnalyser = useAudioAnalyserStore((s) => s.setAnalyser);
  useEffect(() => {
    if (visible) {
      setAnalyser(audioEngine.analyser, "modeller");
    }
    return () => setAnalyser(null, "modeller");
  }, [audioEngine.analyser, setAnalyser, visible]);

  const buildQuickGenerateSettings = useCallback(
    (
      defaults:
        | typeof DEFAULT_INITIAL_PRESET_GENERATION_SETTINGS
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
    reprepareAndGenerateRandom(handleConfirmGenerateNotes);
  }, [handleConfirmGenerateNotes]);

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
              navigationButton={{
                label: "Open Frequency Analyzer",
                title: "Open Frequency Analyzer",
                text: "⤴️",
                onClick: onOpenFrequencyAnalyzer,
              }}
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
              onPlayPopcorn={handlePlayPopcornSnc}
              navigationButton={{
                label: "Open Piano Player",
                title: "Open Piano Player",
                text: "⤴️",
                onClick: onOpenPianoPlayer,
              }}
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
