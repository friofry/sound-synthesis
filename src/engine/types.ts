export const GRAPH_COLORS = {
  canvas: "#ffffff",
  line: "#44bebe",
  dotFree: "#0000ff",
  dotFixed: "#000000",
  highlight: "#50b450",
  playing: "#ff0404",
} as const;

export const START_U = 0;
export const START_V = 0;
export const START_W = 0.000001;
export const START_K = 1;
export const IGNORE_RADIUS = 100;
export const DOT_RADIUS = 5;
export const DEFAULT_SAMPLE_RATE = 8000;
export const DEFAULT_ATTENUATION = 4;
export const DEFAULT_SQUARE_ATTENUATION = (1 / 50) * DEFAULT_ATTENUATION;

export type StiffnessType = "isotropic" | "tetradic";
export type GridType = "cell" | "perimeter" | "empty" | "triangle" | "astra" | "hexagon";
export type SimMethod = "euler" | "runge-kutta";

export type ToolMode =
  | "add-point-link"
  | "delete-point"
  | "delete-link"
  | "select"
  | "drag-point"
  | "drag-viewport"
  | "move-group"
  | "playing-point"
  | "modify-point"
  | "modify-link"
  | "modify-group"
  | "merge-groups"
  | "zoom-in"
  | "zoom-out";

export interface Line {
  dot1: number;
  dot2: number;
  k: number;
}

export interface Dot {
  x: number;
  y: number;
  u: number;
  v: number;
  weight: number;
  fixed: boolean;
  inputFile: string | null;
  lines: Line[];
}

export interface SerializedDot {
  x: number;
  y: number;
  u: number;
  v: number;
  weight: number;
  fixed: boolean;
  inputFile: string | null;
}

export interface SerializedGraph {
  dots: SerializedDot[];
  lines: Line[];
  playingPoint?: number | null;
}

export interface GraphData {
  dots: SerializedDot[];
  lines: Line[];
  playingPoint: number;
}

export interface GridParams {
  n: number;
  m: number;
  layers: number;
  stiffness: number;
  weight: number;
  fixedBorder: boolean;
  stiffnessType: StiffnessType;
  width: number;
  height: number;
}

export interface KoeffStr {
  i: number;
  j: number;
  value: number;
}

export interface SimulationParams {
  sampleRate: number;
  lengthK: number;
  method: SimMethod;
  attenuation: number;
  squareAttenuation: number;
  playingPoint: number;
}

export interface SimulationState {
  u: Float64Array;
  v: Float64Array;
}

export interface SimulationResult {
  frames: Float64Array[];
  playingPointBuffer: Float32Array;
  allPointBuffers: Float32Array[];
}

export type SimulationCaptureMode = "full" | "playing-point-only";
export type SimulationBackend = "legacy" | "optimized";

export interface SimulationWorkerRequest {
  graph: GraphData;
  params: SimulationParams;
  outputMode?: SimulationCaptureMode;
  backend?: SimulationBackend;
}

export interface SimulationWorkerProgress {
  type: "progress";
  completed: number;
  total: number;
}

export type SimulationWorkerComplete =
  | {
      type: "complete";
      outputMode: "full";
      result: SimulationResult;
    }
  | {
      type: "complete";
      outputMode: "playing-point-only";
      playingPointBuffer: Float32Array;
    };

export interface SimulationWorkerError {
  type: "error";
  message: string;
}

export type SimulationWorkerMessage =
  | SimulationWorkerProgress
  | SimulationWorkerComplete
  | SimulationWorkerError;

export type RawInstrumentNote = {
  alias: string;
  keyLabel: string;
  keyCode: string;
  index: number;
  frequency: number;
  buffer: Float32Array;
  sampleRate: number;
};

export const CHROMATIC_DIES_ONE_BASED = new Set([2, 4, 7, 9, 11]);

export function isDies(index: number): boolean {
  return CHROMATIC_DIES_ONE_BASED.has((index + 1) % 12);
}

export function countDies(size: number): number {
  let total = 0;
  for (let i = 0; i < size; i += 1) {
    if (isDies(i)) {
      total += 1;
    }
  }
  return total;
}
