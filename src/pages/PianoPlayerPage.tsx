import { GenerationProgressDialog } from "../components/PianoPlayer/GenerationProgressDialog";
import { GenerateNotesDialog } from "../components/PianoPlayer/GenerateNotesDialog";
import { LegacyOscillogramm } from "../components/PianoPlayer/LegacyOscillogramm";
import { PianoKeyboard } from "../components/PianoPlayer/PianoKeyboard";
import { PianoToolbar } from "../components/PianoPlayer/PianoToolbar";
import { useGraphStore } from "../store/graphStore";
import { usePianoToolbar } from "../hooks/usePianoToolbar";

export function PianoPlayerPage() {
  const graph = useGraphStore((state) => state.graph);
  const simulationParams = useGraphStore((state) => state.simulationParams);

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

  return (
    <div className="piano-page">
      <div className="oscilloscope-panel">
        <LegacyOscillogramm buffer={activeBuffer} sampleRate={activeSampleRate} analyser={audioEngine.analyser} />
      </div>
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
      <div className="keyboard-wrap">
        <PianoKeyboard
          noteCount={noteCount}
          pressedKeys={pressedKeys}
          onPressKey={handlePressKey}
          onReleaseKey={handleReleaseKey}
        />
      </div>
    </div>
  );
}
