import { create } from "zustand";
import { generateGraph } from "../engine/gridGenerators";
import { clonePerturbation, GraphModel } from "../engine/graph";
import { preparePresetGraph, type PresetGraphPreparationOptions } from "../engine/presetGraphPreparation";
import { DEFAULT_GRAPH_STORE_SIMULATION_PARAMS, DEFAULT_HAMMER_DIALOG_SETTINGS } from "../config/defaults";
import {
  type BoundaryMode,
  type GraphPerturbation,
  type GridParams,
  type StiffnessNormalizationMode,
  type GridType,
  type SerializedGraph,
  type SimulationParams,
  type SimulationResult,
  type ToolMode,
  type WeightDistributionMode,
} from "../engine/types";

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DialogState<T> {
  open: boolean;
  payload: T | null;
}

export type HammerDistributionMode = "equivalent" | "smoothed";
export type HammerPlayingPointMode = "impact-point" | "graph-center";
export type HammerAttackMode = "single" | "repeat";
export type HammerRepeatForceMode = "constant" | "fading";
export type HammerRepeatStopMode = "next-click" | "count";

export type HammerSettings = {
  distribution: HammerDistributionMode;
  weight: number;
  velocity: number;
  restitution: number;
  attenuation: number;
  squareAttenuation: number;
  radius: number;
  playingPointMode: HammerPlayingPointMode;
  attackMode: HammerAttackMode;
  repeatHz: number;
  repeatForceMode: HammerRepeatForceMode;
  repeatStopMode: HammerRepeatStopMode;
  repeatCount: number;
};

interface GraphStore {
  graph: GraphModel;
  canvasSize: { width: number; height: number };
  viewportScale: number;
  viewportOffset: { x: number; y: number };
  tool: ToolMode;
  selectedDotA: number | null;
  selectedDotB: number | null;
  selectedLineIndex: number | null;
  hoveredDot: number | null;
  hoveredLineIndex: number | null;
  cursor: { x: number; y: number };
  playingPoint: number | null;
  dragDotIndex: number | null;
  dragGroupRect: Rect | null;
  pendingGroupRect: Rect | null;
  defaultWeight: number;
  defaultStiffness: number;
  stiffnessType: GridParams["stiffnessType"];
  boundaryMode: BoundaryMode;
  stiffnessNormalizationMode: StiffnessNormalizationMode;
  weightDistributionMode: WeightDistributionMode;
  rimWeightRatio: number;
  rimDampingFactor: number;
  insertDialog: DialogState<null>;
  cellTemplateDialog: DialogState<null>;
  hexTemplateDialog: DialogState<null>;
  dotDialog: DialogState<{ dotIndex: number }>;
  lineDialog: DialogState<{ lineIndex: number }>;
  groupDialog: DialogState<{ rect: Rect }>;
  hammerDialog: DialogState<null>;
  communityGraphsDialog: DialogState<null>;
  hammerSettings: HammerSettings;
  hammerPreviewPoint: { x: number; y: number } | null;
  hammerCharge: number;
  toolPerturbation: GraphPerturbation | null;
  simulationParams: SimulationParams;
  isSimulating: boolean;
  simulationProgress: number;
  simulationResult: SimulationResult | null;
  setTool: (tool: ToolMode) => void;
  setCanvasSize: (width: number, height: number) => void;
  zoomViewport: (factor: number, anchorScreenX?: number, anchorScreenY?: number) => void;
  panViewport: (dx: number, dy: number) => void;
  resetViewport: () => void;
  setCursor: (x: number, y: number) => void;
  setHoveredDot: (index: number | null) => void;
  setHoveredLine: (index: number | null) => void;
  setSelectedDots: (dotA: number | null, dotB: number | null) => void;
  setSelectedLineIndex: (index: number | null) => void;
  setPlayingPoint: (index: number | null) => void;
  setDragDotIndex: (index: number | null) => void;
  setPendingGroupRect: (rect: Rect | null) => void;
  setDragGroupRect: (rect: Rect | null) => void;
  setGraph: (graph: GraphModel) => void;
  updateGraph: (updater: (graph: GraphModel) => void) => void;
  clearGraph: () => void;
  createPresetGraph: (type: GridType, params: GridParams, preparation?: PresetGraphPreparationOptions) => void;
  openInsertDialog: () => void;
  closeInsertDialog: () => void;
  openCellTemplateDialog: () => void;
  closeCellTemplateDialog: () => void;
  openHexTemplateDialog: () => void;
  closeHexTemplateDialog: () => void;
  openDotDialog: (dotIndex: number) => void;
  closeDotDialog: () => void;
  openLineDialog: (lineIndex: number) => void;
  closeLineDialog: () => void;
  openGroupDialog: (rect: Rect) => void;
  closeGroupDialog: () => void;
  openHammerDialog: () => void;
  closeHammerDialog: () => void;
  setHammerSettings: (values: Partial<HammerSettings>) => void;
  setHammerPreviewPoint: (point: { x: number; y: number } | null) => void;
  setHammerCharge: (value: number) => void;
  setToolPerturbation: (perturbation: GraphPerturbation | null) => void;
  clearToolPerturbation: () => void;
  openCommunityGraphsDialog: () => void;
  closeCommunityGraphsDialog: () => void;
  setDefaults: (values: {
    defaultWeight?: number;
    defaultStiffness?: number;
    stiffnessType?: GridParams["stiffnessType"];
    boundaryMode?: BoundaryMode;
    stiffnessNormalizationMode?: StiffnessNormalizationMode;
    weightDistributionMode?: WeightDistributionMode;
    rimWeightRatio?: number;
    rimDampingFactor?: number;
  }) => void;
  setSimulationParams: (values: Partial<SimulationParams>) => void;
  setSimulationState: (values: Partial<Pick<GraphStore, "isSimulating" | "simulationProgress" | "simulationResult">>) => void;
  serializeGraph: () => SerializedGraph;
  loadGraph: (payload: SerializedGraph) => void;
}

const defaultSimulationParams: SimulationParams = { ...DEFAULT_GRAPH_STORE_SIMULATION_PARAMS };

const defaultHammerSettings: HammerSettings = { ...DEFAULT_HAMMER_DIALOG_SETTINGS };

const DEFAULT_VIEWPORT_SCALE = 1;
const MIN_VIEWPORT_SCALE = 0.25;
const MAX_VIEWPORT_SCALE = 8;
const HAMMER_CHARGE_MIN = 1;
const HAMMER_CHARGE_MAX = 10;

export const useGraphStore = create<GraphStore>((set, get) => ({
  graph: new GraphModel(),
  canvasSize: { width: 1200, height: 700 },
  viewportScale: DEFAULT_VIEWPORT_SCALE,
  viewportOffset: { x: 0, y: 0 },
  tool: "drag-point",
  selectedDotA: null,
  selectedDotB: null,
  selectedLineIndex: null,
  hoveredDot: null,
  hoveredLineIndex: null,
  cursor: { x: 0, y: 0 },
  playingPoint: null,
  dragDotIndex: null,
  dragGroupRect: null,
  pendingGroupRect: null,
  defaultWeight: 0.000001,
  defaultStiffness: 1,
  stiffnessType: "isotropic",
  boundaryMode: "free",
  stiffnessNormalizationMode: "none",
  weightDistributionMode: "uniform",
  rimWeightRatio: 1.5,
  rimDampingFactor: 0.7,
  insertDialog: { open: false, payload: null },
  cellTemplateDialog: { open: false, payload: null },
  hexTemplateDialog: { open: false, payload: null },
  dotDialog: { open: false, payload: null },
  lineDialog: { open: false, payload: null },
  groupDialog: { open: false, payload: null },
  hammerDialog: { open: false, payload: null },
  communityGraphsDialog: { open: false, payload: null },
  hammerSettings: defaultHammerSettings,
  hammerPreviewPoint: null,
  hammerCharge: HAMMER_CHARGE_MIN,
  toolPerturbation: null,
  simulationParams: defaultSimulationParams,
  isSimulating: false,
  simulationProgress: 0,
  simulationResult: null,
  setTool: (tool) => set({ tool, selectedDotA: null, selectedDotB: null }),
  setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),
  zoomViewport: (factor, anchorScreenX, anchorScreenY) =>
    set((state) => {
      const nextScale = clamp(state.viewportScale * factor, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE);
      if (nextScale === state.viewportScale) {
        return state;
      }

      const screenX = anchorScreenX ?? state.canvasSize.width / 2;
      const screenY = anchorScreenY ?? state.canvasSize.height / 2;
      const worldX = (screenX - state.viewportOffset.x) / state.viewportScale;
      const worldY = (screenY - state.viewportOffset.y) / state.viewportScale;

      return {
        viewportScale: nextScale,
        viewportOffset: {
          x: screenX - worldX * nextScale,
          y: screenY - worldY * nextScale,
        },
      };
    }),
  panViewport: (dx, dy) =>
    set((state) => ({
      viewportOffset: {
        x: state.viewportOffset.x + dx,
        y: state.viewportOffset.y + dy,
      },
    })),
  resetViewport: () =>
    set({
      viewportScale: DEFAULT_VIEWPORT_SCALE,
      viewportOffset: { x: 0, y: 0 },
    }),
  setCursor: (x, y) => set({ cursor: { x, y } }),
  setHoveredDot: (index) => set({ hoveredDot: index }),
  setHoveredLine: (index) => set({ hoveredLineIndex: index }),
  setSelectedDots: (dotA, dotB) => set({ selectedDotA: dotA, selectedDotB: dotB }),
  setSelectedLineIndex: (index) => set({ selectedLineIndex: index }),
  setPlayingPoint: (index) =>
    set((state) => {
      const nextPerturbation = state.graph.getEditorPerturbation();
      nextPerturbation.playingPoint = index;
      state.graph.setEditorPerturbation(nextPerturbation);
      state.graph.playingPoint = index;
      return {
        playingPoint: index,
        simulationParams: {
          ...state.simulationParams,
          playingPoint: state.graph.resolvePlayingPoint(),
        },
      };
    }),
  setDragDotIndex: (index) => set({ dragDotIndex: index }),
  setPendingGroupRect: (rect) => set({ pendingGroupRect: rect }),
  setDragGroupRect: (rect) => set({ dragGroupRect: rect }),
  setGraph: (graph) =>
    set({
      graph,
      toolPerturbation: null,
      playingPoint: graph.getEditorPerturbation().playingPoint ?? graph.playingPoint,
      selectedDotA: null,
      selectedDotB: null,
      selectedLineIndex: null,
      hoveredDot: null,
      hoveredLineIndex: null,
      simulationParams: {
        ...get().simulationParams,
        playingPoint: graph.resolvePlayingPoint(),
      },
    }),
  updateGraph: (updater) =>
    set((state) => {
      const graph = state.graph.clone();
      updater(graph);
      return {
        graph,
        toolPerturbation: null,
        playingPoint: graph.getEditorPerturbation().playingPoint ?? graph.playingPoint,
        simulationParams: {
          ...state.simulationParams,
          playingPoint: graph.resolvePlayingPoint(),
        },
      };
    }),
  clearGraph: () =>
    set({
      graph: new GraphModel(),
      toolPerturbation: null,
      selectedDotA: null,
      selectedDotB: null,
      selectedLineIndex: null,
      playingPoint: null,
      simulationResult: null,
    }),
  createPresetGraph: (type, params, preparation) => {
    const graph = generateGraph(type, params);
    preparePresetGraph(graph, preparation);
    set({
      graph,
      toolPerturbation: null,
      selectedDotA: null,
      selectedDotB: null,
      selectedLineIndex: null,
      playingPoint: graph.getEditorPerturbation().playingPoint ?? graph.playingPoint,
      simulationParams: {
        ...get().simulationParams,
        playingPoint: graph.resolvePlayingPoint(),
      },
      simulationResult: null,
    });
  },
  openInsertDialog: () => set({ insertDialog: { open: true, payload: null } }),
  closeInsertDialog: () => set({ insertDialog: { open: false, payload: null } }),
  openCellTemplateDialog: () => set({ cellTemplateDialog: { open: true, payload: null } }),
  closeCellTemplateDialog: () => set({ cellTemplateDialog: { open: false, payload: null } }),
  openHexTemplateDialog: () => set({ hexTemplateDialog: { open: true, payload: null } }),
  closeHexTemplateDialog: () => set({ hexTemplateDialog: { open: false, payload: null } }),
  openDotDialog: (dotIndex) => set({ dotDialog: { open: true, payload: { dotIndex } } }),
  closeDotDialog: () => set({ dotDialog: { open: false, payload: null } }),
  openLineDialog: (lineIndex) => set({ lineDialog: { open: true, payload: { lineIndex } } }),
  closeLineDialog: () => set({ lineDialog: { open: false, payload: null } }),
  openGroupDialog: (rect) => set({ groupDialog: { open: true, payload: { rect } } }),
  closeGroupDialog: () => set({ groupDialog: { open: false, payload: null } }),
  openHammerDialog: () => set({ hammerDialog: { open: true, payload: null } }),
  closeHammerDialog: () => set({ hammerDialog: { open: false, payload: null } }),
  setHammerSettings: (values) =>
    set((state) => ({
      hammerSettings: { ...state.hammerSettings, ...values },
    })),
  setHammerPreviewPoint: (point) => set({ hammerPreviewPoint: point }),
  setHammerCharge: (value) => set({ hammerCharge: clamp(value, HAMMER_CHARGE_MIN, HAMMER_CHARGE_MAX) }),
  setToolPerturbation: (perturbation) =>
    set({
      toolPerturbation: perturbation ? clonePerturbation(perturbation) : null,
    }),
  clearToolPerturbation: () => set({ toolPerturbation: null }),
  openCommunityGraphsDialog: () => set({ communityGraphsDialog: { open: true, payload: null } }),
  closeCommunityGraphsDialog: () => set({ communityGraphsDialog: { open: false, payload: null } }),
  setDefaults: (values) =>
    set((state) => ({
      defaultWeight: values.defaultWeight ?? state.defaultWeight,
      defaultStiffness: values.defaultStiffness ?? state.defaultStiffness,
      stiffnessType: values.stiffnessType ?? state.stiffnessType,
      boundaryMode: values.boundaryMode ?? state.boundaryMode,
      stiffnessNormalizationMode: values.stiffnessNormalizationMode ?? state.stiffnessNormalizationMode,
      weightDistributionMode: values.weightDistributionMode ?? state.weightDistributionMode,
      rimWeightRatio: values.rimWeightRatio ?? state.rimWeightRatio,
      rimDampingFactor: values.rimDampingFactor ?? state.rimDampingFactor,
    })),
  setSimulationParams: (values) =>
    set((state) => ({
      simulationParams: { ...state.simulationParams, ...values },
    })),
  setSimulationState: (values) =>
    set((state) => ({
      isSimulating: values.isSimulating ?? state.isSimulating,
      simulationProgress: values.simulationProgress ?? state.simulationProgress,
      simulationResult: Object.prototype.hasOwnProperty.call(values, "simulationResult")
        ? (values.simulationResult ?? null)
        : state.simulationResult,
    })),
  serializeGraph: () => {
    const payload = get().graph.toJSON();
    payload.playingPoint = get().playingPoint;
    return payload;
  },
  loadGraph: (payload) => {
    const graph = GraphModel.fromJSON(payload);
    set({
      graph,
      toolPerturbation: null,
      selectedDotA: null,
      selectedDotB: null,
      selectedLineIndex: null,
      playingPoint: graph.getEditorPerturbation().playingPoint ?? graph.playingPoint,
      simulationParams: {
        ...get().simulationParams,
        playingPoint: graph.resolvePlayingPoint(),
      },
      simulationResult: null,
    });
  },
}));

if (import.meta.env.DEV) {
  const graphWindow = window as Window & { __graphStore?: typeof useGraphStore };
  graphWindow.__graphStore = useGraphStore;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
