import { clonePerturbation, GraphModel } from "./graph";
import { scaleGraphForPitchRatio } from "./gridGenerators";
import { runSimulation } from "./simulation";
import { derivePitchCalibrationRatio, estimateFrequencyFromZeroCrossings } from "./tuning";
import type { GraphPerturbation, RawInstrumentNote, SimulationParams } from "./types";
import { DEFAULT_KEYBINDS, DEFAULT_KEY_LABELS } from "../components/PianoPlayer/KeyboardMapping";
import { DEFAULT_SIMULATION_PRECISION, resolveDefaultSimulationBackend } from "./simulationDefaults";

type GenerateInstrumentOptions = {
  noteCount?: number;
  baseFrequency?: number;
  baseIndex?: number;
  sampleRate?: number;
  lengthK?: number;
  attenuation?: number;
  squareAttenuation?: number;
  method?: SimulationParams["method"];
  substepsMode?: SimulationParams["substepsMode"];
  substeps?: number;
  baseGraphSnapshotId?: string;
  perturbation?: GraphPerturbation | null;
};

export function generateInstrumentFromGraph(
  graph: GraphModel,
  options: GenerateInstrumentOptions = {},
): RawInstrumentNote[] {
  const noteCount = options.noteCount ?? DEFAULT_KEYBINDS.length;
  const baseFrequency = options.baseFrequency ?? 440;
  const baseIndex = options.baseIndex ?? 9;
  const sampleRate = options.sampleRate ?? 8000;
  const lengthK = options.lengthK ?? 8;
  const attenuation = options.attenuation ?? 4;
  const squareAttenuation = options.squareAttenuation ?? (1 / 50) * attenuation;
  const method = options.method ?? "euler";
  const backend = resolveDefaultSimulationBackend(method, DEFAULT_SIMULATION_PRECISION);
  const substepsMode = options.substepsMode ?? "fixed";
  const substeps = options.substeps ?? 1;
  const perturbation = clonePerturbation(options.perturbation ?? graph.editorPerturbation);
  const ratioForIndex = (index: number): number => 2 ** ((index - baseIndex) / 12);
  const baseGraphSnapshotId = options.baseGraphSnapshotId ?? "note-generator:base";
  let calibrationPitchRatio = 1;

  if (noteCount > 0) {
    const firstTargetRatio = ratioForIndex(0);
    const calibrationGraph = scaleGraphForPitchRatio(graph, firstTargetRatio);
    calibrationGraph.playingPoint = graph.playingPoint ?? graph.findFirstPlayableDot();
    const calibrationResult = runSimulation(
      calibrationGraph.toGraphData(perturbation),
      {
        sampleRate,
        lengthK,
        method,
        attenuation,
        squareAttenuation,
        playingPoint: calibrationGraph.playingPoint ?? 0,
        substepsMode,
        substeps,
      },
      undefined,
      { capture: "playing-point-only", backend },
    );
    const measuredFirstFrequency = estimateFrequencyFromZeroCrossings(calibrationResult.playingPointBuffer, sampleRate);
    if (measuredFirstFrequency !== null) {
      calibrationPitchRatio = derivePitchCalibrationRatio(baseFrequency * firstTargetRatio, measuredFirstFrequency);
    }
  }

  const notes: RawInstrumentNote[] = [];
  for (let index = 0; index < noteCount; index += 1) {
    const targetRatio = ratioForIndex(index);
    const tunedRatio = targetRatio * calibrationPitchRatio;
    const noteGraph = scaleGraphForPitchRatio(graph, tunedRatio);
    noteGraph.playingPoint = graph.playingPoint ?? graph.findFirstPlayableDot();
    const result = runSimulation(
      noteGraph.toGraphData(perturbation),
      {
        sampleRate,
        lengthK,
        method,
        attenuation,
        squareAttenuation,
        playingPoint: noteGraph.playingPoint ?? 0,
        substepsMode,
        substeps,
      },
      undefined,
      { capture: "playing-point-only", backend },
    );

    notes.push({
      alias: `note-${index}`,
      keyLabel: DEFAULT_KEY_LABELS[index] ?? String(index),
      keyCode: DEFAULT_KEYBINDS[index] ?? `Digit${index}`,
      index,
      frequency: baseFrequency * targetRatio,
      buffer: result.playingPointBuffer,
      sampleRate,
      viewerSource: {
        baseGraphSnapshotId,
        tunedRatio,
        perturbation,
      },
    });
  }

  return notes;
}

export function generateSingleNoteFromGraph(
  graph: GraphModel,
  index = 0,
  options: GenerateInstrumentOptions = {},
): RawInstrumentNote {
  return generateInstrumentFromGraph(graph, { ...options, noteCount: index + 1 })[index];
}
