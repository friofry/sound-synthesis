import { clonePerturbation, GraphModel } from "./graph";
import { scaleGraphForPitchRatio } from "./gridGenerators";
import { runSimulation } from "./simulation";
import {
  derivePitchCalibrationRatio,
  estimateFrequencyFromZeroCrossings,
  estimateProminentFrequencyAWeighted,
} from "./tuning";
import type { GraphPerturbation, RawInstrumentNote, SimulationBackend, SimulationParams, SimulationPrecision } from "./types";
import { DEFAULT_KEYBINDS, DEFAULT_KEY_LABELS } from "../components/PianoPlayer/KeyboardMapping";
import { DEFAULT_GRAPH_STORE_SIMULATION_PARAMS, DEFAULT_SIMULATION_PRECISION, resolveDefaultSimulationBackend } from "../config/defaults";

type GenerateInstrumentOptions = {
  noteCount?: number;
  baseFrequency?: number;
  baseIndex?: number;
  sampleRate?: number;
  lengthK?: number;
  attenuation?: number;
  squareAttenuation?: number;
  method?: SimulationParams["method"];
  backend?: SimulationBackend;
  precision?: SimulationPrecision;
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
  const sampleRate = options.sampleRate ?? DEFAULT_GRAPH_STORE_SIMULATION_PARAMS.sampleRate;
  const lengthK = options.lengthK ?? DEFAULT_GRAPH_STORE_SIMULATION_PARAMS.lengthK;
  const attenuation = options.attenuation ?? DEFAULT_GRAPH_STORE_SIMULATION_PARAMS.attenuation;
  const squareAttenuation = options.squareAttenuation ?? DEFAULT_GRAPH_STORE_SIMULATION_PARAMS.squareAttenuation;
  const method = options.method ?? DEFAULT_GRAPH_STORE_SIMULATION_PARAMS.method;
  const precision = options.precision ?? DEFAULT_SIMULATION_PRECISION;
  const backend = options.backend ?? resolveDefaultSimulationBackend(method, precision);
  const substepsMode = options.substepsMode ?? DEFAULT_GRAPH_STORE_SIMULATION_PARAMS.substepsMode;
  const substeps = options.substeps ?? DEFAULT_GRAPH_STORE_SIMULATION_PARAMS.substeps;
  const perturbation = clonePerturbation(options.perturbation ?? graph.editorPerturbation);
  const resolvedPlayingPoint = graph.resolvePlayingPoint(perturbation);
  const ratioForIndex = (index: number): number => 2 ** ((index - baseIndex) / 12);
  const baseGraphSnapshotId = options.baseGraphSnapshotId ?? "note-generator:base";
  let calibrationPitchRatio = 1;

  if (noteCount > 0) {
    const firstTargetRatio = ratioForIndex(0);
    const calibrationGraph = scaleGraphForPitchRatio(graph, firstTargetRatio);
    calibrationGraph.playingPoint = resolvedPlayingPoint;
    const calibrationResult = runSimulation(
      calibrationGraph.toGraphData(perturbation),
      {
        sampleRate,
        lengthK,
        method,
        attenuation,
        squareAttenuation,
        playingPoint: calibrationGraph.resolvePlayingPoint(perturbation),
        substepsMode,
        substeps,
      },
      undefined,
      { capture: "playing-point-only", backend },
    );
    const measuredFirstFrequency =
      estimateProminentFrequencyAWeighted(calibrationResult.playingPointBuffer, sampleRate) ??
      estimateFrequencyFromZeroCrossings(calibrationResult.playingPointBuffer, sampleRate);
    if (measuredFirstFrequency !== null) {
      calibrationPitchRatio = derivePitchCalibrationRatio(baseFrequency * firstTargetRatio, measuredFirstFrequency);
    }
  }

  const notes: RawInstrumentNote[] = [];
  for (let index = 0; index < noteCount; index += 1) {
    const targetRatio = ratioForIndex(index);
    const tunedRatio = targetRatio * calibrationPitchRatio;
    const noteGraph = scaleGraphForPitchRatio(graph, tunedRatio);
    noteGraph.playingPoint = resolvedPlayingPoint;
    const result = runSimulation(
      noteGraph.toGraphData(perturbation),
      {
        sampleRate,
        lengthK,
        method,
        attenuation,
        squareAttenuation,
        playingPoint: noteGraph.resolvePlayingPoint(perturbation),
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
