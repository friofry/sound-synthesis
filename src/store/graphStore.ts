import { create } from "zustand";
import { generateGraph } from "../engine/gridGenerators";
import { GraphModel } from "../engine/graph";
import { preparePresetGraph, type PresetGraphPreparationOptions } from "../engine/presetGraphPreparation";
import {
  DEFAULT_ATTENUATION,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SQUARE_ATTENUATION,
  type GridParams,
  type GridType,
  type SerializedGraph,
  type SimulationParams,
  type SimulationResult,
  type ToolMode,
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
  fixedBorder: boolean;
  stiffnessType: GridParams["stiffnessType"];
  insertDialog: DialogState<null>;
  cellTemplateDialog: DialogState<null>;
  hexTemplateDialog: DialogState<null>;
  dotDialog: DialogState<{ dotIndex: number }>;
  lineDialog: DialogState<{ lineIndex: number }>;
  groupDialog: DialogState<{ rect: Rect }>;
  simulationDialogOpen: boolean;
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
  openSimulationDialog: () => void;
  closeSimulationDialog: () => void;
  setDefaults: (values: {
    defaultWeight?: number;
    defaultStiffness?: number;
    fixedBorder?: boolean;
    stiffnessType?: GridParams["stiffnessType"];
  }) => void;
  setSimulationParams: (values: Partial<SimulationParams>) => void;
  setSimulationState: (values: Partial<Pick<GraphStore, "isSimulating" | "simulationProgress" | "simulationResult">>) => void;
  serializeGraph: () => SerializedGraph;
  loadGraph: (payload: SerializedGraph) => void;
}

const defaultSimulationParams: SimulationParams = {
  sampleRate: DEFAULT_SAMPLE_RATE,
  lengthK: 8,
  method: "euler",
  attenuation: DEFAULT_ATTENUATION,
  squareAttenuation: DEFAULT_SQUARE_ATTENUATION,
  playingPoint: 0,
};

const DEFAULT_VIEWPORT_SCALE = 1;
const MIN_VIEWPORT_SCALE = 0.25;
const MAX_VIEWPORT_SCALE = 8;

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
  fixedBorder: false,
  stiffnessType: "isotropic",
  insertDialog: { open: false, payload: null },
  cellTemplateDialog: { open: false, payload: null },
  hexTemplateDialog: { open: false, payload: null },
  dotDialog: { open: false, payload: null },
  lineDialog: { open: false, payload: null },
  groupDialog: { open: false, payload: null },
  simulationDialogOpen: false,
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
      state.graph.playingPoint = index;
      return {
        playingPoint: index,
        simulationParams: {
          ...state.simulationParams,
          playingPoint: index ?? 0,
        },
      };
    }),
  setDragDotIndex: (index) => set({ dragDotIndex: index }),
  setPendingGroupRect: (rect) => set({ pendingGroupRect: rect }),
  setDragGroupRect: (rect) => set({ dragGroupRect: rect }),
  setGraph: (graph) =>
    set({
      graph,
      playingPoint: graph.playingPoint,
      selectedDotA: null,
      selectedDotB: null,
      selectedLineIndex: null,
      hoveredDot: null,
      hoveredLineIndex: null,
      simulationParams: {
        ...get().simulationParams,
        playingPoint: graph.playingPoint ?? graph.findFirstPlayableDot(),
      },
    }),
  updateGraph: (updater) =>
    set((state) => {
      const graph = state.graph.clone();
      updater(graph);
      return { graph };
    }),
  clearGraph: () =>
    set({
      graph: new GraphModel(),
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
      selectedDotA: null,
      selectedDotB: null,
      selectedLineIndex: null,
      playingPoint: graph.playingPoint,
      simulationParams: {
        ...get().simulationParams,
        playingPoint: graph.playingPoint ?? 0,
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
  openSimulationDialog: () => set({ simulationDialogOpen: true }),
  closeSimulationDialog: () => set({ simulationDialogOpen: false }),
  setDefaults: (values) =>
    set((state) => ({
      defaultWeight: values.defaultWeight ?? state.defaultWeight,
      defaultStiffness: values.defaultStiffness ?? state.defaultStiffness,
      fixedBorder: values.fixedBorder ?? state.fixedBorder,
      stiffnessType: values.stiffnessType ?? state.stiffnessType,
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
      selectedDotA: null,
      selectedDotB: null,
      selectedLineIndex: null,
      playingPoint: graph.playingPoint,
      simulationParams: {
        ...get().simulationParams,
        playingPoint: graph.playingPoint ?? graph.findFirstPlayableDot(),
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
