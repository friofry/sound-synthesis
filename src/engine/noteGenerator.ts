import { GraphModel } from "./graph";
import { scaleGraphStiffness } from "./gridGenerators";
import { runSimulation } from "./simulation";
import type { RawInstrumentNote, SimulationParams } from "./types";
import { DEFAULT_KEYBINDS, DEFAULT_KEY_LABELS } from "../components/PianoPlayer/KeyboardMapping";

type GenerateInstrumentOptions = {
  noteCount?: number;
  baseFrequency?: number;
  baseIndex?: number;
  sampleRate?: number;
  lengthK?: number;
  attenuation?: number;
  squareAttenuation?: number;
  method?: SimulationParams["method"];
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

  const notes: RawInstrumentNote[] = [];
  for (let index = 0; index < noteCount; index += 1) {
    const ratio = 2 ** ((index - baseIndex) / 12);
    const noteGraph = scaleGraphStiffness(graph, ratio);
    noteGraph.playingPoint = graph.playingPoint ?? graph.findFirstPlayableDot();
    const result = runSimulation(noteGraph.toGraphData(), {
      sampleRate,
      lengthK,
      method,
      attenuation,
      squareAttenuation,
      playingPoint: noteGraph.playingPoint ?? 0,
    });

    notes.push({
      alias: `note-${index}`,
      keyLabel: DEFAULT_KEY_LABELS[index] ?? String(index),
      keyCode: DEFAULT_KEYBINDS[index] ?? `Digit${index}`,
      index,
      frequency: baseFrequency * ratio,
      buffer: result.playingPointBuffer,
      sampleRate,
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
