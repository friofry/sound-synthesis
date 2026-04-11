import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "../components/PianoPlayer/AudioEngine";
import { DEFAULT_KEYBINDS, DEFAULT_KEY_LABELS, getNoteIndexByCode } from "../components/PianoPlayer/KeyboardMapping";
import { generateInstrumentFromGraph } from "../engine/noteGenerator";
import { scaleGraphForPitchRatio } from "../engine/gridGenerators";
import { parseInstrumentFile, serializeInstrumentFile } from "../engine/fileIO/instrumentFile";
import { SncCreator } from "../engine/snc/sncCreator";
import { buildSncPlaybackIntervals, scheduleSncPlaybackKeySimulation } from "../engine/snc/sncPlaybackKeys";
import { renderSncTextToWav } from "../engine/snc/renderSncFromText";
import { derivePitchCalibrationRatio, estimateFrequencyFromZeroCrossings } from "../engine/tuning";
import { clonePerturbation, GraphModel } from "../engine/graph";
import type {
  GraphPerturbation,
  RawInstrumentNote,
  SerializedGraph,
  SimulationBackend,
  SimulationCaptureMode,
  SimulationParams,
  SimulationPrecision,
  SimulationResult,
  SimulationWorkerMessage,
} from "../engine/types";
import type { GenerateNotesDialogValues } from "../components/PianoPlayer/GenerateNotesDialog";
import { registerMelodyPreviewAudioConnector } from "../audio/melodyPreviewBridge";
import { usePianoStore, VIEWER_BASE_GRAPH_SNAPSHOT_IDS } from "../store/pianoStore";
import { DEFAULT_ONE_NOTE_GENERATION_SETTINGS, resolveDefaultSimulationBackend } from "../config/defaults";

type InstrumentBundle = {
  type: "sound-synthesis-instrument";
  manifest: string;
  baseGraphSnapshots?: Record<string, SerializedGraph>;
  notes: Array<{
    alias: string;
    keyLabel: string;
    keyCode: string;
    index: number;
    frequency: number;
    sampleRate: number;
    buffer: number[];
    viewerSource?: RawInstrumentNote["viewerSource"];
  }>;
};

function aliasForIndex(index: number): string {
  return `note-${index}`;
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function resolveLengthK(durationMs: number, sampleRate: number, tillSilence: boolean): number {
  const safeDurationMs = Math.max(1, durationMs);
  const effectiveDurationMs = tillSilence ? Math.max(safeDurationMs * 3, 1000) : safeDurationMs;
  const sampleCount = Math.ceil((sampleRate * effectiveDurationMs) / 1000);
  return Math.max(1, Math.ceil(sampleCount / 1024));
}

function formatRemainingDuration(remainingMs: number | null): string {
  if (remainingMs === null || !Number.isFinite(remainingMs) || remainingMs <= 0) {
    return "calculating...";
  }
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function createAbortError(): Error {
  const error = new Error("Instrument generation cancelled");
  error.name = "AbortError";
  return error;
}

function runSimulationInWorker(
  graph: GraphModel,
  params: SimulationParams,
  outputMode: SimulationCaptureMode = "full",
  backend?: SimulationBackend,
  precision: SimulationPrecision = 64,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
  sharedWorker?: Worker,
): Promise<SimulationResult> {
  const resolvedBackend = backend ?? resolveDefaultSimulationBackend(params.method, precision);
  return new Promise((resolve, reject) => {
    const worker = sharedWorker ?? new Worker(new URL("../engine/simulation.worker.ts", import.meta.url), { type: "module" });
    const ownsWorker = !sharedWorker;
    let settled = false;
    let onMessage: ((event: MessageEvent<SimulationWorkerMessage>) => void) | null = null;
    let onError: ((event: ErrorEvent) => void) | null = null;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      if (onMessage) {
        worker.removeEventListener("message", onMessage as EventListener);
      }
      if (onError) {
        worker.removeEventListener("error", onError as EventListener);
      }
    };

    const rejectWith = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const resolveWith = (result: SimulationResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => {
      worker.terminate();
      rejectWith(createAbortError());
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    onMessage = (event: MessageEvent<SimulationWorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.(message.completed, message.total);
        return;
      }
      if (message.type === "complete") {
        if (ownsWorker) {
          worker.terminate();
        }
        if (message.outputMode === "playing-point-only") {
          resolveWith({
            frames: [],
            allPointBuffers: [],
            playingPointBuffer: message.playingPointBuffer,
          });
          return;
        }
        resolveWith(message.result);
        return;
      }
      if (ownsWorker) {
        worker.terminate();
      }
      rejectWith(new Error(message.message));
    };

    onError = (event: ErrorEvent) => {
      if (ownsWorker) {
        worker.terminate();
      }
      rejectWith(new Error(event.message || "Simulation worker failed"));
    };
    worker.addEventListener("message", onMessage as EventListener);
    worker.addEventListener("error", onError as EventListener);

    worker.postMessage({
      graph: graph.toGraphData(),
      params,
      outputMode,
      backend: resolvedBackend,
      precision,
    });
  });
}

export function createFallbackNotes(noteCount: number): RawInstrumentNote[] {
  const sampleRate = 48_000;
  const durationSec = 2;
  const frameCount = Math.floor(sampleRate * durationSec);
  const notes: RawInstrumentNote[] = [];

  for (let index = 0; index < noteCount; index += 1) {
    const alias = `note-${index}`;
    const frequency = 440 * 2 ** ((index - 9) / 12);
    const samples = new Float32Array(frameCount);

    for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
      const time = sampleIndex / sampleRate;
      const env = Math.exp(-3.5 * time);
      samples[sampleIndex] = Math.sin(2 * Math.PI * frequency * time) * env * 0.45;
    }

    notes.push({ alias, keyLabel: alias, keyCode: alias, index, frequency, buffer: samples, sampleRate });
  }

  return notes;
}

type UsePianoToolbarOptions = {
  graph: GraphModel;
  simulationParams: SimulationParams;
};

export function usePianoToolbar({ graph, simulationParams }: UsePianoToolbarOptions) {
  const noteCount = usePianoStore((s) => s.noteCount);
  const pressedKeys = usePianoStore((s) => s.pressedKeys);
  const activeBuffer = usePianoStore((s) => s.activeBuffer);
  const activeSampleRate = usePianoStore((s) => s.activeSampleRate);
  const instrumentNotes = usePianoStore((s) => s.instrumentNotes);
  const generateNotesDialogOpen = usePianoStore((s) => s.generateNotesDialogOpen);
  const generateNotesSettings = usePianoStore((s) => s.generateNotesSettings);
  const isGeneratingInstrument = usePianoStore((s) => s.isGeneratingInstrument);
  const generationProgressDialogOpen = usePianoStore((s) => s.generationProgressDialogOpen);
  const instrumentGenerationProgress = usePianoStore((s) => s.instrumentGenerationProgress);
  const instrumentGenerationLabel = usePianoStore((s) => s.instrumentGenerationLabel);
  const recording = usePianoStore((s) => s.recording);
  const lastSncText = usePianoStore((s) => s.lastSncText);
  const lastRenderedWav = usePianoStore((s) => s.lastRenderedWav);
  const pressKey = usePianoStore((s) => s.pressKey);
  const releaseKey = usePianoStore((s) => s.releaseKey);
  const releaseAll = usePianoStore((s) => s.releaseAll);
  const setActiveBuffer = usePianoStore((s) => s.setActiveBuffer);
  const setInstrumentNotes = usePianoStore((s) => s.setInstrumentNotes);
  const setViewerBaseGraphSnapshots = usePianoStore((s) => s.setViewerBaseGraphSnapshots);
  const setViewerBaseGraphSnapshot = usePianoStore((s) => s.setViewerBaseGraphSnapshot);
  const viewerBaseGraphSnapshots = usePianoStore((s) => s.viewerBaseGraphSnapshots);
  const setGenerateNotesDialogOpen = usePianoStore((s) => s.setGenerateNotesDialogOpen);
  const setGenerateNotesSettings = usePianoStore((s) => s.setGenerateNotesSettings);
  const setInstrumentGenerationState = usePianoStore((s) => s.setInstrumentGenerationState);
  const setRecording = usePianoStore((s) => s.setRecording);
  const setLastSncText = usePianoStore((s) => s.setLastSncText);
  const setLastRenderedWav = usePianoStore((s) => s.setLastRenderedWav);

  const [initialNotes] = useState<RawInstrumentNote[]>(() =>
    instrumentNotes.length ? instrumentNotes : createFallbackNotes(noteCount),
  );

  const [audioEngine] = useState(() => new AudioEngine());
  const keyboardHeldCodes = useRef(new Set<string>());
  const activeAliasesRef = useRef(new Set<string>());
  const wasGraphEmptyRef = useRef(graph.dots.length === 0);
  const recorderRef = useRef<SncCreator | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const sncPlaybackCleanupRef = useRef<(() => void) | null>(null);
  const previewAudioAnalyserDisconnectRef = useRef<(() => void) | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    registerMelodyPreviewAudioConnector(audioEngine);
    return () => registerMelodyPreviewAudioConnector(null);
  }, [audioEngine]);

  const startSncPlaybackKeySimulation = useCallback(
    (audio: HTMLAudioElement, text: string) => {
      sncPlaybackCleanupRef.current?.();
      const intervals = buildSncPlaybackIntervals(text, instrumentNotes);
      const { pressKey: storePress, releaseKey: storeRelease } = usePianoStore.getState();
      sncPlaybackCleanupRef.current = scheduleSncPlaybackKeySimulation(audio, intervals, storePress, storeRelease);
    },
    [instrumentNotes],
  );

  useEffect(() => {
    setInstrumentNotes(initialNotes);
    audioEngine.loadInstrument(initialNotes);
    setActiveBuffer(initialNotes[0]?.buffer ?? null, initialNotes[0]?.sampleRate ?? 48_000);

    return () => {
      audioEngine.stopAll(true);
      sncPlaybackCleanupRef.current?.();
      sncPlaybackCleanupRef.current = null;
      previewAudioAnalyserDisconnectRef.current?.();
      previewAudioAnalyserDisconnectRef.current = null;
      audioPreviewRef.current?.pause();
      audioPreviewRef.current = null;
    };
  }, [audioEngine, initialNotes, setActiveBuffer, setInstrumentNotes]);

  useEffect(() => {
    if (!instrumentNotes.length) return;
    audioEngine.loadInstrument(instrumentNotes);
    recorderRef.current = new SncCreator(instrumentNotes.map((note) => note.alias));
  }, [audioEngine, instrumentNotes]);

  useEffect(() => {
    const isGraphEmpty = graph.dots.length === 0;
    if (isGraphEmpty && !wasGraphEmptyRef.current) {
      audioEngine.stopAll(true);
      activeAliasesRef.current.clear();
      keyboardHeldCodes.current.clear();
      releaseAll();
      setInstrumentNotes(createFallbackNotes(noteCount));
      setLastRenderedWav(null);
    }
    wasGraphEmptyRef.current = isGraphEmpty;
  }, [audioEngine, graph.dots.length, noteCount, releaseAll, setInstrumentNotes, setLastRenderedWav]);

  const syncOscillogram = useCallback(
    (index: number) => {
      const note = instrumentNotes[index];
      if (!note) return;
      setActiveBuffer(note.buffer, note.sampleRate);
    },
    [instrumentNotes, setActiveBuffer],
  );

  const updateRecording = useCallback(() => {
    if (!recording || !recorderRef.current) return;
    recorderRef.current.keyEvent(new Set(activeAliasesRef.current));
  }, [recording]);

  useEffect(() => {
    const heldCodes = keyboardHeldCodes.current;
    const activeAliases = activeAliasesRef.current;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        audioEngine.stopAll(true);
        releaseAll();
        activeAliases.clear();
        heldCodes.clear();
        updateRecording();
        return;
      }

      const index = getNoteIndexByCode(event.code);
      if (index === null || heldCodes.has(event.code)) return;
      heldCodes.add(event.code);
      pressKey(index);
      syncOscillogram(index);
      activeAliases.add(aliasForIndex(index));
      updateRecording();
      void audioEngine.playNote(aliasForIndex(index));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const index = getNoteIndexByCode(event.code);
      if (index === null) return;
      heldCodes.delete(event.code);
      releaseKey(index);
      activeAliases.delete(aliasForIndex(index));
      updateRecording();
      audioEngine.stopNote(aliasForIndex(index), false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      audioEngine.stopAll(true);
      heldCodes.clear();
      activeAliases.clear();
      releaseAll();
    };
  }, [audioEngine, pressKey, releaseAll, releaseKey, syncOscillogram, updateRecording]);

  const handlePressKey = useCallback(
    (index: number) => {
      if (pressedKeys.has(index)) return;
      pressKey(index);
      syncOscillogram(index);
      activeAliasesRef.current.add(aliasForIndex(index));
      updateRecording();
      void audioEngine.playNote(aliasForIndex(index));
    },
    [audioEngine, pressKey, pressedKeys, syncOscillogram, updateRecording],
  );

  const handleReleaseKey = useCallback(
    (index: number, immediate: boolean) => {
      releaseKey(index);
      activeAliasesRef.current.delete(aliasForIndex(index));
      updateRecording();
      audioEngine.stopNote(aliasForIndex(index), immediate);
    },
    [audioEngine, releaseKey, updateRecording],
  );

  const generateInstrument = useCallback(() => {
    if (isGeneratingInstrument) {
      return;
    }
    setGenerateNotesDialogOpen(true);
  }, [isGeneratingInstrument, setGenerateNotesDialogOpen]);

  const closeGenerateNotesDialog = useCallback(() => {
    setGenerateNotesDialogOpen(false);
  }, [setGenerateNotesDialogOpen]);

  const closeGenerationProgressDialog = useCallback(() => {
    generationAbortRef.current?.abort();
    setInstrumentGenerationState({
      isGeneratingInstrument: false,
      generationProgressDialogOpen: false,
      instrumentGenerationProgress: 0,
      instrumentGenerationLabel: "",
    });
  }, [setInstrumentGenerationState]);

  const generateSingleNoteFromSource = useCallback(
    async (options?: {
      sourceGraph?: GraphModel;
      perturbation?: GraphPerturbation | null;
      autoplay?: boolean;
      snapshotId?: string;
    }): Promise<RawInstrumentNote | null> => {
      const targetGraph = options?.sourceGraph ?? graph;
      if (targetGraph.dots.length === 0) {
        const fallback = createFallbackNotes(1)[0];
        audioEngine.setNote(fallback);
        setActiveBuffer(fallback.buffer, fallback.sampleRate);
        if (options?.autoplay) {
          await audioEngine.playNote(fallback.alias);
        }
        return fallback;
      }
      const snapshotId = options?.snapshotId ?? VIEWER_BASE_GRAPH_SNAPSHOT_IDS.singleNote;
      const perturbation = clonePerturbation(options?.perturbation ?? targetGraph.getEditorPerturbation());
      setViewerBaseGraphSnapshot(snapshotId, targetGraph.toJSON());
      const oneNoteSettings = DEFAULT_ONE_NOTE_GENERATION_SETTINGS;
      const oneNoteLengthK = resolveLengthK(
        oneNoteSettings.durationMs,
        oneNoteSettings.sampleRate,
        oneNoteSettings.tillSilence,
      );
      const note = generateInstrumentFromGraph(targetGraph, {
        noteCount: 1,
        sampleRate: oneNoteSettings.sampleRate,
        lengthK: oneNoteLengthK,
        attenuation: oneNoteSettings.attenuation,
        squareAttenuation: oneNoteSettings.squareAttenuation,
        method: oneNoteSettings.method,
        backend: oneNoteSettings.backend,
        precision: oneNoteSettings.precision,
        substepsMode: oneNoteSettings.substepsMode,
        substeps: oneNoteSettings.substeps,
        baseGraphSnapshotId: snapshotId,
        perturbation,
      })[0];
      audioEngine.setNote(note);
      setActiveBuffer(note.buffer, note.sampleRate);
      if (options?.autoplay) {
        await audioEngine.playNote(note.alias);
      }
      return note;
    },
    [audioEngine, graph, setActiveBuffer, setViewerBaseGraphSnapshot],
  );

  const handleConfirmGenerateNotes = useCallback(
    async (
      values: GenerateNotesDialogValues,
      sourceGraph?: GraphModel,
      options?: { persistSettings?: boolean },
    ) => {
      const targetGraph = sourceGraph ?? graph;
      const basePerturbation = clonePerturbation(targetGraph.getEditorPerturbation());
      const safeOctaves = Math.max(1, Math.min(3, Math.round(values.octaves))) as 1 | 2 | 3;
      const safeAttenuation = Number.isFinite(values.attenuation) ? Math.max(0, values.attenuation) : simulationParams.attenuation;
      const safeSquareAttenuation = Number.isFinite(values.squareAttenuation)
        ? Math.max(0, values.squareAttenuation)
        : simulationParams.squareAttenuation;
      const safeSampleRate = values.sampleRate;
      const safeDurationMs = Number.isFinite(values.durationMs) ? Math.max(1, Math.round(values.durationMs)) : 150;
      const safeTillSilence = Boolean(values.tillSilence);
      const safeMethod = values.method === "runge-kutta" ? "runge-kutta" : "euler";
      const safeBackend: SimulationBackend = values.backend;
      const safePrecision: SimulationPrecision = values.precision === 32 ? 32 : 64;
      const safeSubstepsMode = values.substepsMode === "adaptive" ? "adaptive" : "fixed";
      const safeSubsteps = Number.isFinite(values.substeps) ? Math.max(1, Math.round(values.substeps)) : 1;
      const safeNoteCount = safeOctaves * 12;

      if (options?.persistSettings ?? true) {
        setGenerateNotesSettings({
          octaves: safeOctaves,
          attenuation: safeAttenuation,
          squareAttenuation: safeSquareAttenuation,
          durationMs: safeDurationMs,
          tillSilence: safeTillSilence,
          sampleRate: safeSampleRate,
          method: safeMethod,
          backend: safeBackend,
          precision: safePrecision,
          substepsMode: safeSubstepsMode,
          substeps: safeSubsteps,
        });
      }
      setGenerateNotesDialogOpen(false);
      setInstrumentGenerationState({
        isGeneratingInstrument: true,
        generationProgressDialogOpen: true,
        instrumentGenerationProgress: 0,
        instrumentGenerationLabel: "Preparing simulation...",
      });
      const abortController = new AbortController();
      const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 2 : 2;
      const workerCount = Math.max(1, Math.min(safeNoteCount, Math.min(4, Math.max(2, Math.floor(cpuCount / 2)))));
      const generationWorkers = Array.from(
        { length: workerCount },
        () => new Worker(new URL("../engine/simulation.worker.ts", import.meta.url), { type: "module" }),
      );
      generationAbortRef.current = abortController;
      const generationStartMs = performance.now();

      try {
        if (targetGraph.dots.length > 0) {
          const baseIndex = 9;
          const baseFrequency = 440;
          const lengthK = resolveLengthK(safeDurationMs, safeSampleRate, safeTillSilence);
          const ratioForIndex = (index: number): number => 2 ** ((index - baseIndex) / 12);
          let calibrationPitchRatio = 1;
          const notes: RawInstrumentNote[] = [];

          setInstrumentGenerationState({
            instrumentGenerationProgress: 0,
            instrumentGenerationLabel: "Calibrating first note...",
          });
          const firstTargetRatio = ratioForIndex(0);
          const calibrationGraph = scaleGraphForPitchRatio(targetGraph, firstTargetRatio);
          calibrationGraph.playingPoint = targetGraph.playingPoint ?? targetGraph.findFirstPlayableDot();
          const calibrationResult = await runSimulationInWorker(
            calibrationGraph,
            {
              sampleRate: safeSampleRate,
              lengthK,
              attenuation: safeAttenuation,
              squareAttenuation: safeSquareAttenuation,
              method: safeMethod,
              playingPoint: calibrationGraph.playingPoint ?? 0,
              substepsMode: safeSubstepsMode,
              substeps: safeSubsteps,
            },
            "playing-point-only",
            safeBackend,
            safePrecision,
            undefined,
            abortController.signal,
            generationWorkers[0],
          );
          const measuredFirstFrequency = estimateFrequencyFromZeroCrossings(calibrationResult.playingPointBuffer, safeSampleRate);
          if (measuredFirstFrequency !== null) {
            calibrationPitchRatio = derivePitchCalibrationRatio(baseFrequency * firstTargetRatio, measuredFirstFrequency);
          }

          const noteProgress = new Array<number>(safeNoteCount).fill(0);
          const baseGraphSnapshotId = VIEWER_BASE_GRAPH_SNAPSHOT_IDS.instrument;
          setViewerBaseGraphSnapshot(baseGraphSnapshotId, targetGraph.toJSON());
          const updateGenerationProgress = () => {
            const totalProgress = noteProgress.reduce((sum, value) => sum + value, 0);
            const absoluteProgress = (totalProgress / safeNoteCount) * 100;
            const generationElapsedMs = performance.now() - generationStartMs;
            const ratio = absoluteProgress / 100;
            const remainingMs = ratio > 0 ? (generationElapsedMs * (1 - ratio)) / ratio : null;
            const estimationText = formatRemainingDuration(remainingMs);
            const completedNotes = noteProgress.filter((value) => value >= 1).length;
            setInstrumentGenerationState({
              instrumentGenerationProgress: Math.round(absoluteProgress),
              instrumentGenerationLabel: `Generating notes ${completedNotes}/${safeNoteCount} (${workerCount} workers). Estimation: ${estimationText}`,
            });
          };

          let nextIndex = 0;
          const runWorkerLane = async (worker: Worker) => {
            while (true) {
              if (abortController.signal.aborted) {
                throw createAbortError();
              }
              const index = nextIndex;
              nextIndex += 1;
              if (index >= safeNoteCount) {
                return;
              }
              const targetRatio = ratioForIndex(index);
              const tunedRatio = targetRatio * calibrationPitchRatio;
              const noteGraph = scaleGraphForPitchRatio(targetGraph, tunedRatio);
              noteGraph.playingPoint = targetGraph.playingPoint ?? targetGraph.findFirstPlayableDot();

              const result = await runSimulationInWorker(
                noteGraph,
                {
                  sampleRate: safeSampleRate,
                  lengthK,
                  attenuation: safeAttenuation,
                  squareAttenuation: safeSquareAttenuation,
                  method: safeMethod,
                  playingPoint: noteGraph.playingPoint ?? 0,
                  substepsMode: safeSubstepsMode,
                  substeps: safeSubsteps,
                },
                "playing-point-only",
                safeBackend,
                safePrecision,
                (completed, total) => {
                  noteProgress[index] = total > 0 ? completed / total : 0;
                  updateGenerationProgress();
                },
                abortController.signal,
                worker,
              );

              noteProgress[index] = 1;
              updateGenerationProgress();
              notes[index] = {
                alias: `note-${index}`,
                keyLabel: DEFAULT_KEY_LABELS[index] ?? String(index),
                keyCode: DEFAULT_KEYBINDS[index] ?? `Digit${index}`,
                index,
                frequency: baseFrequency * targetRatio,
                buffer: result.playingPointBuffer,
                sampleRate: safeSampleRate,
                viewerSource: {
                  baseGraphSnapshotId,
                  tunedRatio,
                  perturbation: basePerturbation,
                },
              };
            }
          };

          await Promise.all(generationWorkers.map((worker) => runWorkerLane(worker)));
          setInstrumentNotes(notes);
        } else {
          setInstrumentNotes(createFallbackNotes(safeNoteCount));
        }
        setLastRenderedWav(null);
        if (abortController.signal.aborted) {
          throw createAbortError();
        }
        setInstrumentGenerationState({
          isGeneratingInstrument: false,
          generationProgressDialogOpen: false,
          instrumentGenerationProgress: 100,
          instrumentGenerationLabel: "Done",
        });
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        setInstrumentGenerationState({
          isGeneratingInstrument: false,
          generationProgressDialogOpen: false,
          instrumentGenerationProgress: 0,
          instrumentGenerationLabel: "",
        });
        if (!isAbort) {
          window.alert(error instanceof Error ? error.message : "Instrument generation failed");
        }
      } finally {
        generationWorkers.forEach((worker) => worker.terminate());
        if (generationAbortRef.current === abortController) {
          generationAbortRef.current = null;
        }
      }
    },
    [
      graph,
      setGenerateNotesDialogOpen,
      setGenerateNotesSettings,
      setInstrumentGenerationState,
      setInstrumentNotes,
      setLastRenderedWav,
      setViewerBaseGraphSnapshot,
      simulationParams,
    ],
  );

  const handleGenerateOne = useCallback(() => {
    void generateSingleNoteFromSource();
  }, [generateSingleNoteFromSource]);

  const handlePlayPreviewBuffer = useCallback(
    async (buffer: Float32Array, sampleRate: number) => {
      const alias = "__hammer-preview__";
      const note: RawInstrumentNote = {
        alias,
        keyLabel: "hammer",
        keyCode: "hammer",
        index: -1,
        frequency: 0,
        buffer,
        sampleRate,
      };
      audioEngine.setNote(note);
      setActiveBuffer(buffer, sampleRate);
      await audioEngine.playNote(alias);
    },
    [audioEngine, setActiveBuffer],
  );

  const handleToggleRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (!recording) {
      recorder.start();
      setRecording(true);
      setLastSncText("");
      return;
    }
    const text = recorder.finish();
    setRecording(false);
    setLastSncText(text);
  }, [recording, setRecording, setLastSncText]);

  const handleSaveInstrument = useCallback(() => {
    const manifest = serializeInstrumentFile(
      instrumentNotes.map((note, index) => ({
        alias: note.alias,
        key: String.fromCharCode(65 + (index % 26)),
        wavPath: `${note.alias}.wav`,
      })),
    );
    const bundle: InstrumentBundle = {
      type: "sound-synthesis-instrument",
      manifest,
      notes: instrumentNotes.map((note) => ({
        alias: note.alias,
        keyLabel: note.keyLabel,
        keyCode: note.keyCode,
        index: note.index,
        frequency: note.frequency,
        sampleRate: note.sampleRate,
        buffer: Array.from(note.buffer),
        viewerSource: note.viewerSource,
      })),
      baseGraphSnapshots: viewerBaseGraphSnapshots,
    };
    downloadBlob("instrument.json", new Blob([JSON.stringify(bundle)], { type: "application/json" }));
  }, [instrumentNotes, viewerBaseGraphSnapshots]);

  const handleLoadInstrumentFile = useCallback(
    async (file: File) => {
      if (file.name.endsWith(".wav")) {
        const decoded = await audioEngine.decodeAudioBufferFromFile(file);
        const samples = new Float32Array(decoded.getChannelData(0));
        const note: RawInstrumentNote = {
          alias: "note-0",
          keyLabel: "0",
          keyCode: "KeyQ",
          index: 0,
          frequency: 440,
          buffer: samples,
          sampleRate: decoded.sampleRate,
        };
        setInstrumentNotes([note]);
        return;
      }

      const text = await file.text();
      try {
        const parsed = JSON.parse(text) as InstrumentBundle;
        if (parsed.type === "sound-synthesis-instrument" && Array.isArray(parsed.notes)) {
          const notes: RawInstrumentNote[] = parsed.notes.map((note) => ({
            ...note,
            buffer: Float32Array.from(note.buffer),
          }));
          setViewerBaseGraphSnapshots(parsed.baseGraphSnapshots ?? {});
          setInstrumentNotes(notes);
          return;
        }
      } catch {
        // fall through to .ins parsing
      }

      const manifest = parseInstrumentFile(text);
      window.alert(`Parsed ${manifest.length} entries from .ins, but browser loading of external WAV paths is not implemented.`);
    },
    [audioEngine, setInstrumentNotes, setViewerBaseGraphSnapshots],
  );

  const handleSaveSnc = useCallback(() => {
    if (!lastSncText) return;
    downloadBlob("melody.snc", new Blob([lastSncText], { type: "text/plain" }));
  }, [lastSncText]);

  const handleLoadSncFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      if (instrumentNotes.length === 0) {
        window.alert("Generate or load an instrument first, then open an SNC file.");
        return;
      }
      try {
        const { wavBlob } = renderSncTextToWav(text, instrumentNotes);
        setLastSncText(text);
        setLastRenderedWav(wavBlob);

        const url = URL.createObjectURL(wavBlob);
        const audio = new Audio(url);
        audioPreviewRef.current?.pause();
        previewAudioAnalyserDisconnectRef.current?.();
        previewAudioAnalyserDisconnectRef.current = null;
        sncPlaybackCleanupRef.current?.();
        audioPreviewRef.current = audio;
        previewAudioAnalyserDisconnectRef.current = await audioEngine.connectHtml5AudioForVisualization(audio);
        startSncPlaybackKeySimulation(audio, text);
        await audio.play();
        audio.onended = () => {
          previewAudioAnalyserDisconnectRef.current?.();
          previewAudioAnalyserDisconnectRef.current = null;
          sncPlaybackCleanupRef.current?.();
          sncPlaybackCleanupRef.current = null;
          URL.revokeObjectURL(url);
        };
      } catch (error) {
        window.alert(`Failed to play SNC: ${(error as Error).message}`);
      }
    },
    [audioEngine, instrumentNotes, setLastSncText, setLastRenderedWav, startSncPlaybackKeySimulation],
  );

  const handlePlayRenderedWav = useCallback(async () => {
    if (!lastRenderedWav) return;
    const url = URL.createObjectURL(lastRenderedWav);
    const audio = new Audio(url);
    audioPreviewRef.current?.pause();
    previewAudioAnalyserDisconnectRef.current?.();
    previewAudioAnalyserDisconnectRef.current = null;
    sncPlaybackCleanupRef.current?.();
    audioPreviewRef.current = audio;
    previewAudioAnalyserDisconnectRef.current = await audioEngine.connectHtml5AudioForVisualization(audio);
    if (lastSncText) {
      startSncPlaybackKeySimulation(audio, lastSncText);
    }
    await audio.play();
    audio.onended = () => {
      previewAudioAnalyserDisconnectRef.current?.();
      previewAudioAnalyserDisconnectRef.current = null;
      sncPlaybackCleanupRef.current?.();
      sncPlaybackCleanupRef.current = null;
      URL.revokeObjectURL(url);
    };
  }, [audioEngine, lastRenderedWav, lastSncText, startSncPlaybackKeySimulation]);

  return {
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
    handlePlayRenderedWav,
  };
}
