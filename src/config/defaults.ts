import { parse } from "yaml";
import defaultsYaml from "./defaults.yaml?raw";

type SimMethod = "euler" | "runge-kutta";
type SimulationBackend =
  | "legacy"
  | "optimized"
  | "edge-list"
  | "edge-types"
  | "compiled"
  | "fused-loop"
  | "sorted-edge-csr"
  | "wasm-hotloop"
  | "wasm-hotloop-simd"
  | "wasm-hotloop-simd-packed"
  | "wasm-hotloop-simd-intrinsics"
  | "csr-layout-hybrid"
  | "wasm-csr";
type SimulationPrecision = 32 | 64;
type SimulationSubstepsMode = "fixed" | "adaptive";
type GridType = "cell" | "perimeter" | "empty" | "triangle" | "astra" | "hexagon" | "disk-hex";
type BoundaryMode = "free" | "fixed" | "rim-damped" | "rim-heavy";
type DistributionMode = "equivalent" | "smoothed";
type FixMode = "none" | "fix" | "unfix";
type PlayingPointMode = "center" | "first-playable";
type HammerDistributionMode = "equivalent" | "smoothed";
type HammerPlayingPointMode = "impact-point" | "graph-center";
type SimulationDefaultsKey =
  | "randomTool"
  | "initialPreset"
  | "insertGraphDialog"
  | "viewerLiveSimulation"
  | "oneNoteGenerator"
  | "hammerOneShot";

type GenerationSettingsProfile = {
  octaves: 1 | 2 | 3;
  durationMs: number;
  tillSilence: boolean;
  sampleRate: 8000 | 22050 | 44100;
  attenuation: number;
  squareAttenuation: number;
  method: SimMethod;
  backend: SimulationBackend;
  precision: SimulationPrecision;
  substepsMode: SimulationSubstepsMode;
  substeps: number;
};

type HammerDialogDefaults = {
  distribution: HammerDistributionMode;
  weight: number;
  velocity: number;
  restitution: number;
  attenuation: number;
  squareAttenuation: number;
  radius: number;
  playingPointMode: HammerPlayingPointMode;
};

type CellTemplateDialogDefaults = {
  widthPoints: number;
  heightPoints: number;
  stiffness: number;
  weight: number;
  boundaryMode: Extract<BoundaryMode, "free" | "fixed">;
};

type HexTemplateDialogDefaults = {
  layers: number;
  stiffness: number;
  weight: number;
  boundaryMode: Extract<BoundaryMode, "free" | "fixed">;
};

type GroupModifyDialogDefaults = {
  maxAmplitude: number;
  maxWeight: number;
  stiffness: number;
  distribution: DistributionMode;
  fixMode: FixMode;
};

type InsertGraphTopologyStateDefaults = {
  cell: { rows: number; cols: number };
  perimeter: { rows: number; cols: number };
  empty: { rows: number; cols: number };
  triangle: { rows: number; cols: number };
  astra: { rays: number; layers: number };
  hexagon: { layers: number };
  diskHex: { layers: number };
};

type InsertGraphDialogDefaults = {
  initialType: GridType;
  topologyState: InsertGraphTopologyStateDefaults;
  playingPointMode: PlayingPointMode;
  applyCenterGroup: boolean;
  maxAmplitude: number;
  distribution: DistributionMode;
  fixMode: FixMode;
  generateOctaves123: boolean;
  generateOctavesCount: 1 | 2 | 3;
};

type AppDefaults = {
  simulation: {
    backendResolution: Record<SimMethod, Record<`${SimulationPrecision}`, SimulationBackend>>;
    graphStore: {
      sampleRate: number;
      lengthK: number;
      attenuation: number;
      squareAttenuation: number;
      playingPoint: number;
    };
    dialogDefaults: {
      piano: GenerationSettingsProfile;
      hammer: HammerDialogDefaults;
      cellTemplate: CellTemplateDialogDefaults;
      hexTemplate: HexTemplateDialogDefaults;
      groupModify: GroupModifyDialogDefaults;
      insertGraph: InsertGraphDialogDefaults;
    };
    simulationDefaults: Record<SimulationDefaultsKey, GenerationSettingsProfile>;
  };
  piano: {
    noteCount: number;
    activeSampleRate: number;
  };
};

const SIM_METHODS = ["euler", "runge-kutta"] as const;
const SIMULATION_BACKENDS = [
  "legacy",
  "optimized",
  "edge-list",
  "edge-types",
  "compiled",
  "fused-loop",
  "sorted-edge-csr",
  "wasm-hotloop",
  "wasm-hotloop-simd",
  "wasm-hotloop-simd-packed",
  "wasm-hotloop-simd-intrinsics",
  "csr-layout-hybrid",
  "wasm-csr",
] as const;
const SIMULATION_PRECISIONS = [32, 64] as const;
const SUBSTEPS_MODES = ["fixed", "adaptive"] as const;
const SAMPLE_RATES = [8000, 22050, 44100] as const;
const OCTAVES = [1, 2, 3] as const;
const SIMULATION_DEFAULTS_KEYS = [
  "randomTool",
  "initialPreset",
  "insertGraphDialog",
  "viewerLiveSimulation",
  "oneNoteGenerator",
  "hammerOneShot",
] as const satisfies readonly SimulationDefaultsKey[];

export const APP_DEFAULTS = parseAppDefaults(parse(defaultsYaml));

export const DEFAULT_PIANO_DIALOG_SETTINGS = APP_DEFAULTS.simulation.dialogDefaults.piano;
export const DEFAULT_HAMMER_DIALOG_SETTINGS = APP_DEFAULTS.simulation.dialogDefaults.hammer;
export const DEFAULT_CELL_TEMPLATE_DIALOG_SETTINGS = APP_DEFAULTS.simulation.dialogDefaults.cellTemplate;
export const DEFAULT_HEX_TEMPLATE_DIALOG_SETTINGS = APP_DEFAULTS.simulation.dialogDefaults.hexTemplate;
export const DEFAULT_GROUP_MODIFY_DIALOG_SETTINGS = APP_DEFAULTS.simulation.dialogDefaults.groupModify;
export const DEFAULT_INSERT_GRAPH_DIALOG_SETTINGS = APP_DEFAULTS.simulation.dialogDefaults.insertGraph;
export const DEFAULT_SIMULATION_METHOD: SimMethod = DEFAULT_PIANO_DIALOG_SETTINGS.method;
export const DEFAULT_SIMULATION_PRECISION: SimulationPrecision = DEFAULT_PIANO_DIALOG_SETTINGS.precision;
export const DEFAULT_SIMULATION_SUBSTEPS_MODE: SimulationSubstepsMode = DEFAULT_PIANO_DIALOG_SETTINGS.substepsMode;
export const DEFAULT_SIMULATION_SUBSTEPS = DEFAULT_PIANO_DIALOG_SETTINGS.substeps;
export const DEFAULT_SIMULATION_BACKEND: SimulationBackend = resolveDefaultSimulationBackend(
  DEFAULT_SIMULATION_METHOD,
  DEFAULT_SIMULATION_PRECISION,
);

export const DEFAULT_GRAPH_STORE_SIMULATION_PARAMS = {
  sampleRate: APP_DEFAULTS.simulation.graphStore.sampleRate,
  lengthK: APP_DEFAULTS.simulation.graphStore.lengthK,
  method: DEFAULT_PIANO_DIALOG_SETTINGS.method,
  attenuation: APP_DEFAULTS.simulation.graphStore.attenuation,
  squareAttenuation: APP_DEFAULTS.simulation.graphStore.squareAttenuation,
  playingPoint: APP_DEFAULTS.simulation.graphStore.playingPoint,
  substepsMode: DEFAULT_PIANO_DIALOG_SETTINGS.substepsMode,
  substeps: DEFAULT_PIANO_DIALOG_SETTINGS.substeps,
} as const;

export const DEFAULT_RANDOM_TOOL_GENERATION_SETTINGS = APP_DEFAULTS.simulation.simulationDefaults.randomTool;
export const DEFAULT_INITIAL_PRESET_GENERATION_SETTINGS = APP_DEFAULTS.simulation.simulationDefaults.initialPreset;
export const DEFAULT_INSERT_GRAPH_DIALOG_GENERATION_SETTINGS = APP_DEFAULTS.simulation.simulationDefaults.insertGraphDialog;
export const DEFAULT_VIEWER_LIVE_SIMULATION_SETTINGS = APP_DEFAULTS.simulation.simulationDefaults.viewerLiveSimulation;
export const DEFAULT_ONE_NOTE_GENERATION_SETTINGS = APP_DEFAULTS.simulation.simulationDefaults.oneNoteGenerator;
export const DEFAULT_HAMMER_ONE_SHOT_SETTINGS = APP_DEFAULTS.simulation.simulationDefaults.hammerOneShot;
export const DEFAULT_PIANO_GENERATION_SETTINGS = DEFAULT_PIANO_DIALOG_SETTINGS;
export const DEFAULT_CREATE_PIANO_SETTINGS = DEFAULT_PIANO_DIALOG_SETTINGS;
export const DEFAULT_VIEWER_STEPPER_SETTINGS = DEFAULT_VIEWER_LIVE_SIMULATION_SETTINGS;

export function resolveDefaultSimulationBackend(
  method: SimMethod = DEFAULT_SIMULATION_METHOD,
  precision: SimulationPrecision = DEFAULT_SIMULATION_PRECISION,
): SimulationBackend {
  return APP_DEFAULTS.simulation.backendResolution[method][String(precision) as `${SimulationPrecision}`];
}

export const DEFAULT_SIMULATION_PROFILE = {
  method: DEFAULT_SIMULATION_METHOD,
  backend: DEFAULT_SIMULATION_BACKEND,
  precision: DEFAULT_SIMULATION_PRECISION,
  substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
  substeps: DEFAULT_SIMULATION_SUBSTEPS,
} as const;

export const CI_BENCHMARK_BACKENDS: readonly SimulationBackend[] = [
  "legacy",
  DEFAULT_SIMULATION_BACKEND,
] as const;

function parseAppDefaults(value: unknown): AppDefaults {
  const root = expectObject(value, "root");
  const simulation = expectObject(root.simulation, "simulation");
  const piano = expectObject(root.piano, "piano");
  const backendResolution = expectObject(simulation.backendResolution, "simulation.backendResolution");
  const graphStore = expectObject(simulation.graphStore, "simulation.graphStore");
  const dialogDefaults = expectObject(simulation.dialogDefaults, "simulation.dialogDefaults");
  const simulationDefaults = expectObject(simulation.simulationDefaults, "simulation.simulationDefaults");

  return {
    simulation: {
      backendResolution: parseBackendResolution(backendResolution),
      graphStore: {
        sampleRate: expectNumber(graphStore.sampleRate, "simulation.graphStore.sampleRate"),
        lengthK: expectNumber(graphStore.lengthK, "simulation.graphStore.lengthK"),
        attenuation: expectNumber(graphStore.attenuation, "simulation.graphStore.attenuation"),
        squareAttenuation: expectNumber(graphStore.squareAttenuation, "simulation.graphStore.squareAttenuation"),
        playingPoint: expectNumber(graphStore.playingPoint, "simulation.graphStore.playingPoint"),
      },
      dialogDefaults: {
        piano: parseGenerationProfile(expectObject(dialogDefaults.piano, "simulation.dialogDefaults.piano"), "simulation.dialogDefaults.piano"),
        hammer: parseHammerDialogDefaults(expectObject(dialogDefaults.hammer, "simulation.dialogDefaults.hammer"), "simulation.dialogDefaults.hammer"),
        cellTemplate: parseCellTemplateDialogDefaults(
          expectObject(dialogDefaults.cellTemplate, "simulation.dialogDefaults.cellTemplate"),
          "simulation.dialogDefaults.cellTemplate",
        ),
        hexTemplate: parseHexTemplateDialogDefaults(
          expectObject(dialogDefaults.hexTemplate, "simulation.dialogDefaults.hexTemplate"),
          "simulation.dialogDefaults.hexTemplate",
        ),
        groupModify: parseGroupModifyDialogDefaults(
          expectObject(dialogDefaults.groupModify, "simulation.dialogDefaults.groupModify"),
          "simulation.dialogDefaults.groupModify",
        ),
        insertGraph: parseInsertGraphDialogDefaults(
          expectObject(dialogDefaults.insertGraph, "simulation.dialogDefaults.insertGraph"),
          "simulation.dialogDefaults.insertGraph",
        ),
      },
      simulationDefaults: parseSimulationDefaults(simulationDefaults),
    },
    piano: {
      noteCount: expectNumber(piano.noteCount, "piano.noteCount"),
      activeSampleRate: expectNumber(piano.activeSampleRate, "piano.activeSampleRate"),
    },
  };
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid defaults config at ${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function parseBackendResolution(value: Record<string, unknown>): AppDefaults["simulation"]["backendResolution"] {
  const result = {} as AppDefaults["simulation"]["backendResolution"];
  for (const method of SIM_METHODS) {
    const methodMap = expectObject(value[method], `simulation.backendResolution.${method}`);
    result[method] = {
      "32": expectOneOf(methodMap["32"], SIMULATION_BACKENDS, `simulation.backendResolution.${method}.32`),
      "64": expectOneOf(methodMap["64"], SIMULATION_BACKENDS, `simulation.backendResolution.${method}.64`),
    };
  }
  return result;
}

function parseSimulationDefaults(value: Record<string, unknown>): AppDefaults["simulation"]["simulationDefaults"] {
  const result = {} as AppDefaults["simulation"]["simulationDefaults"];
  for (const key of SIMULATION_DEFAULTS_KEYS) {
    result[key] = parseGenerationProfile(expectObject(value[key], `simulation.simulationDefaults.${key}`), `simulation.simulationDefaults.${key}`);
  }
  return result;
}

function parseGenerationProfile(value: Record<string, unknown>, path: string): GenerationSettingsProfile {
  return {
    octaves: expectOneOf(value.octaves, OCTAVES, `${path}.octaves`),
    durationMs: expectNumber(value.durationMs, `${path}.durationMs`),
    tillSilence: expectBoolean(value.tillSilence, `${path}.tillSilence`),
    sampleRate: expectOneOf(value.sampleRate, SAMPLE_RATES, `${path}.sampleRate`),
    attenuation: expectNumber(value.attenuation, `${path}.attenuation`),
    squareAttenuation: expectNumber(value.squareAttenuation, `${path}.squareAttenuation`),
    method: expectOneOf(value.method, SIM_METHODS, `${path}.method`),
    backend: expectOneOf(value.backend, SIMULATION_BACKENDS, `${path}.backend`),
    precision: expectOneOf(value.precision, SIMULATION_PRECISIONS, `${path}.precision`),
    substepsMode: expectOneOf(value.substepsMode, SUBSTEPS_MODES, `${path}.substepsMode`),
    substeps: expectNumber(value.substeps, `${path}.substeps`),
  };
}

function parseHammerDialogDefaults(value: Record<string, unknown>, path: string): HammerDialogDefaults {
  return {
    distribution: expectOneOf(value.distribution, ["equivalent", "smoothed"] as const, `${path}.distribution`),
    weight: expectNumber(value.weight, `${path}.weight`),
    velocity: expectNumber(value.velocity, `${path}.velocity`),
    restitution: expectNumber(value.restitution, `${path}.restitution`),
    attenuation: expectNumber(value.attenuation, `${path}.attenuation`),
    squareAttenuation: expectNumber(value.squareAttenuation, `${path}.squareAttenuation`),
    radius: expectNumber(value.radius, `${path}.radius`),
    playingPointMode: expectOneOf(value.playingPointMode, ["impact-point", "graph-center"] as const, `${path}.playingPointMode`),
  };
}

function parseCellTemplateDialogDefaults(value: Record<string, unknown>, path: string): CellTemplateDialogDefaults {
  return {
    widthPoints: expectNumber(value.widthPoints, `${path}.widthPoints`),
    heightPoints: expectNumber(value.heightPoints, `${path}.heightPoints`),
    stiffness: expectNumber(value.stiffness, `${path}.stiffness`),
    weight: expectNumber(value.weight, `${path}.weight`),
    boundaryMode: expectOneOf(value.boundaryMode, ["free", "fixed"] as const, `${path}.boundaryMode`),
  };
}

function parseHexTemplateDialogDefaults(value: Record<string, unknown>, path: string): HexTemplateDialogDefaults {
  return {
    layers: expectNumber(value.layers, `${path}.layers`),
    stiffness: expectNumber(value.stiffness, `${path}.stiffness`),
    weight: expectNumber(value.weight, `${path}.weight`),
    boundaryMode: expectOneOf(value.boundaryMode, ["free", "fixed"] as const, `${path}.boundaryMode`),
  };
}

function parseGroupModifyDialogDefaults(value: Record<string, unknown>, path: string): GroupModifyDialogDefaults {
  return {
    maxAmplitude: expectNumber(value.maxAmplitude, `${path}.maxAmplitude`),
    maxWeight: expectNumber(value.maxWeight, `${path}.maxWeight`),
    stiffness: expectNumber(value.stiffness, `${path}.stiffness`),
    distribution: expectOneOf(value.distribution, ["equivalent", "smoothed"] as const, `${path}.distribution`),
    fixMode: expectOneOf(value.fixMode, ["none", "fix", "unfix"] as const, `${path}.fixMode`),
  };
}

function parseInsertGraphDialogDefaults(value: Record<string, unknown>, path: string): InsertGraphDialogDefaults {
  const topologyState = expectObject(value.topologyState, `${path}.topologyState`);
  return {
    initialType: expectOneOf(
      value.initialType,
      ["cell", "perimeter", "empty", "triangle", "astra", "hexagon", "disk-hex"] as const,
      `${path}.initialType`,
    ),
    topologyState: {
      cell: parseRowsCols(expectObject(topologyState.cell, `${path}.topologyState.cell`), `${path}.topologyState.cell`),
      perimeter: parseRowsCols(expectObject(topologyState.perimeter, `${path}.topologyState.perimeter`), `${path}.topologyState.perimeter`),
      empty: parseRowsCols(expectObject(topologyState.empty, `${path}.topologyState.empty`), `${path}.topologyState.empty`),
      triangle: parseRowsCols(expectObject(topologyState.triangle, `${path}.topologyState.triangle`), `${path}.topologyState.triangle`),
      astra: {
        rays: expectNumber(expectObject(topologyState.astra, `${path}.topologyState.astra`).rays, `${path}.topologyState.astra.rays`),
        layers: expectNumber(expectObject(topologyState.astra, `${path}.topologyState.astra`).layers, `${path}.topologyState.astra.layers`),
      },
      hexagon: {
        layers: expectNumber(expectObject(topologyState.hexagon, `${path}.topologyState.hexagon`).layers, `${path}.topologyState.hexagon.layers`),
      },
      diskHex: {
        layers: expectNumber(expectObject(topologyState.diskHex, `${path}.topologyState.diskHex`).layers, `${path}.topologyState.diskHex.layers`),
      },
    },
    playingPointMode: expectOneOf(value.playingPointMode, ["center", "first-playable"] as const, `${path}.playingPointMode`),
    applyCenterGroup: expectBoolean(value.applyCenterGroup, `${path}.applyCenterGroup`),
    maxAmplitude: expectNumber(value.maxAmplitude, `${path}.maxAmplitude`),
    distribution: expectOneOf(value.distribution, ["equivalent", "smoothed"] as const, `${path}.distribution`),
    fixMode: expectOneOf(value.fixMode, ["none", "fix", "unfix"] as const, `${path}.fixMode`),
    generateOctaves123: expectBoolean(value.generateOctaves123, `${path}.generateOctaves123`),
    generateOctavesCount: expectOneOf(value.generateOctavesCount, OCTAVES, `${path}.generateOctavesCount`),
  };
}

function parseRowsCols(value: Record<string, unknown>, path: string): { rows: number; cols: number } {
  return {
    rows: expectNumber(value.rows, `${path}.rows`),
    cols: expectNumber(value.cols, `${path}.cols`),
  };
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid defaults config at ${path}: expected finite number`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid defaults config at ${path}: expected boolean`);
  }
  return value;
}

function expectOneOf<const T extends readonly (string | number)[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (allowed.some((candidate) => candidate === value)) {
    return value as T[number];
  }
  throw new Error(`Invalid defaults config at ${path}: expected one of ${allowed.join(", ")}`);
}
