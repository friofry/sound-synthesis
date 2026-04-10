import { DEFAULT_RANDOM_TOOL_GENERATION_SETTINGS } from "../config/defaults";
import type {
  BoundaryMode,
  GridType,
  StiffnessNormalizationMode,
  StiffnessType,
  WeightDistributionMode,
} from "../engine/types";
import type { DistributionMode } from "../engine/presetGraphPreparation";
import type { GraphModel } from "../engine/graph";
import type { GenerateNotesDialogValues } from "../components/PianoPlayer/GenerateNotesDialog";
import { useGraphStore } from "../store/graphStore";
import { useMembraneViewerStore } from "../store/membraneViewerStore";
import { useViewerStore } from "../store/viewerStore";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createRandomPresetConfig(): {
  graphType: GridType;
  size: number;
  stiffness: number;
  amplitude: number;
  centerGroupRadiusRatio: number;
  stiffnessType: StiffnessType;
  boundaryMode: BoundaryMode;
  stiffnessNormalizationMode: StiffnessNormalizationMode;
  weightDistributionMode: WeightDistributionMode;
  centerDistribution: DistributionMode;
  rimWeightRatio: number;
  rimDampingFactor: number;
} {
  const graphTypes: GridType[] = ["cell", "triangle", "astra", "hexagon", "disk-hex"];
  const boundaryModes: BoundaryMode[] = ["fixed"];
  const stiffnessNormalizationModes: StiffnessNormalizationMode[] = ["none", "by-edge-length", "by-rest-area"];
  const weightDistributionModes: WeightDistributionMode[] = ["uniform", "by-node-area", "edge-light"];
  const centerDistributions: DistributionMode[] = ["equivalent", "smoothed"];
  return {
    graphType: graphTypes[randomInt(0, graphTypes.length - 1)],
    size: randomInt(5, 20),
    stiffness: randomFloat(1, 5),
    amplitude: randomFloat(0.1, 0.8),
    centerGroupRadiusRatio: randomFloat(0.175, 0.475),
    stiffnessType: Math.random() < 0.5 ? "tetradic" : "isotropic",
    boundaryMode: boundaryModes[randomInt(0, boundaryModes.length - 1)],
    stiffnessNormalizationMode: stiffnessNormalizationModes[randomInt(0, stiffnessNormalizationModes.length - 1)],
    weightDistributionMode: weightDistributionModes[randomInt(0, weightDistributionModes.length - 1)],
    centerDistribution: centerDistributions[randomInt(0, centerDistributions.length - 1)],
    rimWeightRatio: randomFloat(1, 3),
    rimDampingFactor: randomFloat(0.05, 0.95),
  };
}

export type ConfirmGenerateNotesHandler = (
  values: GenerateNotesDialogValues,
  sourceGraph?: GraphModel,
  options?: { persistSettings?: boolean },
) => void | Promise<void>;

/**
 * Random preset graph + viewer init + generate octaves (2), same as the editor 🎲 / Space shortcut.
 */
export function reprepareAndGenerateRandom(handleConfirmGenerateNotes: ConfirmGenerateNotesHandler): void {
  const randomPreset = createRandomPresetConfig();
  const currentState = useGraphStore.getState();
  const width = Math.max(1, currentState.canvasSize.width);
  const height = Math.max(1, currentState.canvasSize.height);

  currentState.setDefaults({
    boundaryMode: randomPreset.boundaryMode,
    stiffnessType: randomPreset.stiffnessType,
    defaultStiffness: randomPreset.stiffness,
    stiffnessNormalizationMode: randomPreset.stiffnessNormalizationMode,
    weightDistributionMode: randomPreset.weightDistributionMode,
    rimWeightRatio: randomPreset.rimWeightRatio,
    rimDampingFactor: randomPreset.rimDampingFactor,
  });

  currentState.createPresetGraph(
    randomPreset.graphType,
    {
      n: randomPreset.size,
      m: randomPreset.size,
      layers: randomPreset.size,
      stiffness: randomPreset.stiffness,
      weight: currentState.defaultWeight,
      stiffnessType: randomPreset.stiffnessType,
      boundaryMode: randomPreset.boundaryMode,
      stiffnessNormalizationMode: randomPreset.stiffnessNormalizationMode,
      weightDistributionMode: randomPreset.weightDistributionMode,
      rimWeightRatio: randomPreset.rimWeightRatio,
      rimDampingFactor: randomPreset.rimDampingFactor,
      width,
      height,
    },
    {
      playingPointMode: "center",
      centerGroup: {
        enabled: true,
        maxAmplitude: randomPreset.amplitude,
        maxWeight: currentState.defaultWeight,
        stiffness: randomPreset.stiffness,
        distribution: randomPreset.centerDistribution,
        fixMode: "none",
        radiusRatio: randomPreset.centerGroupRadiusRatio,
      },
    },
  );
  currentState.setTool("hammer");

  const preparedGraph = useGraphStore.getState().graph.clone();
  const { initializeSource } = useMembraneViewerStore.getState();
  const { resetFrame } = useViewerStore.getState();
  initializeSource("editor", preparedGraph, {
    activate: true,
    force: true,
    perturbation: preparedGraph.editorPerturbation,
  });
  resetFrame();
  void handleConfirmGenerateNotes(
    { ...DEFAULT_RANDOM_TOOL_GENERATION_SETTINGS },
    preparedGraph,
    { persistSettings: false },
  );
}
