import { useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_INSERT_GRAPH_DIALOG_SETTINGS } from "../../../config/defaults";
import type {
  BoundaryMode,
  GridParams,
  GridTopologyParams,
  GridType,
  StiffnessNormalizationMode,
  StiffnessType,
  WeightDistributionMode,
} from "../../../engine/types";
import type {
  CenterGroupModifyOptions,
  DistributionMode,
  FixMode,
  PlayingPointMode,
} from "../../../engine/presetGraphPreparation";
import { useGraphStore } from "../../../store/graphStore";
import {
  MfcButton,
  MfcCheckbox,
  MfcDialog,
  MfcField,
  MfcGroupBox,
  MfcNumberInput,
  MfcSelect,
} from "../../ui/MfcDialog";

export type InsertGraphFormProps = {
  open: boolean;
  initialType?: GridType;
  formDefaults?: typeof DEFAULT_INSERT_GRAPH_DIALOG_SETTINGS;
  defaults: {
    weight: number;
    stiffness: number;
    stiffnessType: StiffnessType;
    boundaryMode: BoundaryMode;
    stiffnessNormalizationMode: StiffnessNormalizationMode;
    weightDistributionMode: WeightDistributionMode;
    rimWeightRatio: number;
    rimDampingFactor: number;
    attenuation: number;
    squareAttenuation: number;
  };
  onApply: (values: {
    topology: GridTopologyParams;
    weight: number;
    stiffness: number;
    stiffnessType: StiffnessType;
    boundaryMode: BoundaryMode;
    stiffnessNormalizationMode: StiffnessNormalizationMode;
    weightDistributionMode: WeightDistributionMode;
    rimWeightRatio: number;
    rimDampingFactor: number;
    attenuation: number;
    squareAttenuation: number;
    playingPointMode: PlayingPointMode;
    centerGroup: CenterGroupModifyOptions;
    generateOctaves123: boolean;
    generateOctavesCount: 1 | 2 | 3;
  }) => void;
  onClose: () => void;
};

export function InsertGraphForm({
  open,
  initialType = DEFAULT_INSERT_GRAPH_DIALOG_SETTINGS.initialType,
  formDefaults = DEFAULT_INSERT_GRAPH_DIALOG_SETTINGS,
  defaults,
  onApply,
  onClose,
}: InsertGraphFormProps) {
  const [type, setType] = useState<GridType>(initialType);
  const [topologyState, setTopologyState] = useState<TopologyFormState>({
    ...formDefaults.topologyState,
  });
  const [weight, setWeight] = useState(defaults.weight);
  const [stiffness, setStiffness] = useState(defaults.stiffness);
  const [stiffType, setStiffType] = useState<StiffnessType>(defaults.stiffnessType);
  const [boundaryMode, setBoundaryMode] = useState<BoundaryMode>(defaults.boundaryMode);
  const [stiffnessNormalizationMode, setStiffnessNormalizationMode] =
    useState<StiffnessNormalizationMode>(defaults.stiffnessNormalizationMode);
  const [weightDistributionMode, setWeightDistributionMode] = useState<WeightDistributionMode>(defaults.weightDistributionMode);
  const [rimWeightRatio, setRimWeightRatio] = useState(defaults.rimWeightRatio);
  const [rimDampingFactor, setRimDampingFactor] = useState(defaults.rimDampingFactor);
  const [attenuation, setAttenuation] = useState(defaults.attenuation);
  const [squareAttenuation, setSquareAttenuation] = useState(defaults.squareAttenuation);
  const [playingPointMode, setPlayingPointMode] = useState<PlayingPointMode>(formDefaults.playingPointMode);
  const [applyCenterGroup, setApplyCenterGroup] = useState(formDefaults.applyCenterGroup);
  const [maxAmplitude, setMaxAmplitude] = useState(formDefaults.maxAmplitude);
  const [distribution, setDistribution] = useState<DistributionMode>(formDefaults.distribution);
  const [fixMode, setFixMode] = useState<FixMode>(formDefaults.fixMode);
  const [groupWeight, setGroupWeight] = useState(defaults.weight);
  const [groupWeightTouched, setGroupWeightTouched] = useState(false);
  const [groupStiffness, setGroupStiffness] = useState(defaults.stiffness);
  const [groupStiffnessTouched, setGroupStiffnessTouched] = useState(false);
  const [generateOctaves123, setGenerateOctaves123] = useState(formDefaults.generateOctaves123);
  const [generateOctavesCount, setGenerateOctavesCount] = useState<1 | 2 | 3>(formDefaults.generateOctavesCount);

  const effectiveGroupWeight = groupWeightTouched ? groupWeight : weight;
  const effectiveGroupStiffness = groupStiffnessTouched ? groupStiffness : stiffness;

  if (!open) {
    return null;
  }

  return (
    <MfcDialog
      title="Insert Graph Dialog"
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onApply({
          topology: buildTopologyParams(type, topologyState),
          stiffness: Number.isFinite(stiffness) ? stiffness : 1,
          weight: Number.isFinite(weight) ? weight : 0.000001,
          stiffnessType: stiffType,
          boundaryMode,
          stiffnessNormalizationMode,
          weightDistributionMode,
          rimWeightRatio: Number.isFinite(rimWeightRatio) ? Math.max(1, rimWeightRatio) : 1.5,
          rimDampingFactor: Number.isFinite(rimDampingFactor) ? Math.max(0, Math.min(1, rimDampingFactor)) : 0.7,
          attenuation: Number.isFinite(attenuation) ? Math.max(0, attenuation) : 4,
          squareAttenuation: Number.isFinite(squareAttenuation) ? Math.max(0, squareAttenuation) : 0.08,
          playingPointMode,
          centerGroup: {
            enabled: applyCenterGroup,
            maxAmplitude: Number.isFinite(maxAmplitude) ? maxAmplitude : 0.75,
            maxWeight: Number.isFinite(effectiveGroupWeight) ? effectiveGroupWeight : 0.000001,
            stiffness: Number.isFinite(effectiveGroupStiffness) ? effectiveGroupStiffness : 1,
            distribution,
            fixMode,
          },
          generateOctaves123,
          generateOctavesCount,
        })
      }
      width={460}
      actions={
        <>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
          <MfcButton type="submit" defaultAction>
            OK
          </MfcButton>
        </>
      }
    >
      <MfcGroupBox legend="Graph Type">
        <MfcField label="Topology" labelWidth={110}>
          <MfcSelect
          value={type}
          onChange={(value) => {
            if (isGridType(value)) {
              setType(value);
            }
          }}
          options={[
            { value: "hexagon", label: "Hexagonal (isotropic)" },
            { value: "disk-hex", label: "Disk Hexagonal (isotropic)" },
            { value: "triangle", label: "Triangulated Cell" },
            { value: "cell", label: "Cell" },
            { value: "astra", label: "Astra" },
            { value: "perimeter", label: "Perimeter" },
            { value: "empty", label: "Empty" },
          ]}
        />
        </MfcField>
      </MfcGroupBox>

      <MfcGroupBox legend="Graph Params">
        {type === "astra" ? (
          <>
            <MfcField label="Rays" labelWidth={110}>
              <MfcNumberInput
                min={3}
                value={topologyState.astra.rays}
                onChange={(value) => setTopologyState((prev) => ({ ...prev, astra: { ...prev.astra, rays: value } }))}
              />
            </MfcField>
            <MfcField label="Layers" labelWidth={110}>
              <MfcNumberInput
                min={1}
                value={topologyState.astra.layers}
                onChange={(value) => setTopologyState((prev) => ({ ...prev, astra: { ...prev.astra, layers: value } }))}
              />
            </MfcField>
          </>
        ) : null}
        {type === "hexagon" || type === "disk-hex" ? (
          <MfcField label="Layers" labelWidth={110}>
            <MfcNumberInput
              min={1}
              value={type === "hexagon" ? topologyState.hexagon.layers : topologyState.diskHex.layers}
              onChange={(value) =>
                setTopologyState((prev) =>
                  type === "hexagon"
                    ? { ...prev, hexagon: { layers: value } }
                    : { ...prev, diskHex: { layers: value } },
                )
              }
            />
          </MfcField>
        ) : null}
        {type !== "astra" && type !== "hexagon" && type !== "disk-hex" ? (
          <>
            <MfcField label="Rows" labelWidth={110}>
              <MfcNumberInput min={1} value={topologyState[type].rows} onChange={(value) => setRowsByType(type, value, setTopologyState)} />
            </MfcField>
            <MfcField label="Cols" labelWidth={110}>
              <MfcNumberInput min={1} value={topologyState[type].cols} onChange={(value) => setColsByType(type, value, setTopologyState)} />
            </MfcField>
          </>
        ) : null}
      </MfcGroupBox>

      <MfcGroupBox legend="Defaults">
        <MfcField label="Stiffness Type" labelWidth={110}>
          <MfcSelect
            value={stiffType}
            onChange={setStiffType}
            options={[
              { value: "isotropic", label: "Isotropic" },
              { value: "tetradic", label: "Tetradic" },
            ]}
          />
        </MfcField>
        <MfcField label="Default Stiffness" labelWidth={110}>
          <MfcNumberInput step="0.1" value={stiffness} onChange={setStiffness} />
        </MfcField>
        <MfcField label="Default Weight" labelWidth={110}>
          <MfcNumberInput step="0.000001" value={weight} onChange={setWeight} />
        </MfcField>
        <MfcField label="Boundary" labelWidth={110}>
          <MfcSelect
            value={boundaryMode}
            onChange={setBoundaryMode}
            options={[
              { value: "free", label: "Free" },
              { value: "fixed", label: "Fixed rim" },
              { value: "rim-damped", label: "Rim damped" },
              { value: "rim-heavy", label: "Rim heavy" },
            ]}
          />
        </MfcField>
        <MfcField label="Stiffness Norm" labelWidth={110}>
          <MfcSelect
            value={stiffnessNormalizationMode}
            onChange={setStiffnessNormalizationMode}
            options={[
              { value: "none", label: "None" },
              { value: "by-edge-length", label: "By edge length" },
              { value: "by-rest-area", label: "By rest area" },
            ]}
          />
        </MfcField>
        <MfcField label="Weight Distrib." labelWidth={110}>
          <MfcSelect
            value={weightDistributionMode}
            onChange={setWeightDistributionMode}
            options={[
              { value: "uniform", label: "Uniform" },
              { value: "by-node-area", label: "By node area" },
              { value: "edge-light", label: "Edge light" },
            ]}
          />
        </MfcField>
        {(boundaryMode === "rim-heavy" || boundaryMode === "rim-damped") ? (
          <MfcField label="Rim Weight x" labelWidth={110}>
            <MfcNumberInput step="0.1" min={1} value={rimWeightRatio} onChange={setRimWeightRatio} />
          </MfcField>
        ) : null}
        {boundaryMode === "rim-damped" ? (
          <MfcField label="Rim Damping" labelWidth={110}>
            <MfcNumberInput step="0.05" min={0} max={1} value={rimDampingFactor} onChange={setRimDampingFactor} />
          </MfcField>
        ) : null}
      </MfcGroupBox>

      <MfcGroupBox legend="Damping Defaults">
        <MfcField label="Linear" labelWidth={110}>
          <MfcNumberInput step="0.1" min={0} value={attenuation} onChange={setAttenuation} />
        </MfcField>
        <MfcField label="Square" labelWidth={110}>
          <MfcNumberInput step="0.001" min={0} value={squareAttenuation} onChange={setSquareAttenuation} />
        </MfcField>
      </MfcGroupBox>

      <MfcGroupBox legend="Generation Prep">
        <MfcField label="Playing Point" labelWidth={110}>
          <MfcSelect
            value={playingPointMode}
            onChange={setPlayingPointMode}
            options={[
              { value: "center", label: "Center" },
              { value: "first-playable", label: "First playable" },
            ]}
          />
        </MfcField>
        <MfcCheckbox checked={applyCenterGroup} onChange={setApplyCenterGroup}>
          Apply center modify group
        </MfcCheckbox>
        {applyCenterGroup ? (
          <>
            <MfcField label="Max Amplitude" labelWidth={110}>
              <MfcNumberInput step="0.01" value={maxAmplitude} onChange={setMaxAmplitude} />
            </MfcField>
            <MfcField label="Max Weight" labelWidth={110}>
              <MfcNumberInput
                step="0.000001"
                value={effectiveGroupWeight}
                onChange={(value) => {
                  setGroupWeightTouched(true);
                  setGroupWeight(value);
                }}
              />
            </MfcField>
            <MfcField label="Stiffness" labelWidth={110}>
              <MfcNumberInput
                step="0.1"
                value={effectiveGroupStiffness}
                onChange={(value) => {
                  setGroupStiffnessTouched(true);
                  setGroupStiffness(value);
                }}
              />
            </MfcField>
            <MfcField label="Distribution" labelWidth={110}>
              <MfcSelect
                value={distribution}
                onChange={setDistribution}
                options={[
                  { value: "equivalent", label: "Equivalent" },
                  { value: "smoothed", label: "Smoothed" },
                ]}
              />
            </MfcField>
            <MfcField label="Fix / Unfix" labelWidth={110}>
              <MfcSelect
                value={fixMode}
                onChange={setFixMode}
                options={[
                  { value: "none", label: "No change" },
                  { value: "fix", label: "Fix points" },
                  { value: "unfix", label: "Unfix points" },
                ]}
              />
            </MfcField>
          </>
        ) : null}
        <MfcField label="Generate Octaves" labelWidth={110}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MfcCheckbox checked={generateOctaves123} onChange={setGenerateOctaves123}>
              Auto-generate
            </MfcCheckbox>
            <MfcSelect
              value={String(generateOctavesCount)}
              onChange={(value) => {
                if (value === "1" || value === "2" || value === "3") {
                  setGenerateOctavesCount(Number(value) as 1 | 2 | 3);
                }
              }}
              options={[
                { value: "1", label: "1 octave" },
                { value: "2", label: "2 octaves" },
                { value: "3", label: "3 octaves" },
              ]}
              disabled={!generateOctaves123}
            />
          </div>
        </MfcField>
      </MfcGroupBox>
    </MfcDialog>
  );
}

type RowColTopologyType = "cell" | "perimeter" | "empty" | "triangle";

type TopologyFormState = {
  cell: { rows: number; cols: number };
  perimeter: { rows: number; cols: number };
  empty: { rows: number; cols: number };
  triangle: { rows: number; cols: number };
  astra: { rays: number; layers: number };
  hexagon: { layers: number };
  diskHex: { layers: number };
};

type GridSharedParams = Omit<GridParams, "n" | "m" | "layers">;

function isGridType(value: string): value is GridType {
  return value === "cell"
    || value === "perimeter"
    || value === "empty"
    || value === "triangle"
    || value === "astra"
    || value === "hexagon"
    || value === "disk-hex";
}

function buildTopologyParams(type: GridType, state: TopologyFormState): GridTopologyParams {
  switch (type) {
    case "cell":
      return { type, rows: sanitizeInt(state.cell.rows, 1), cols: sanitizeInt(state.cell.cols, 1) };
    case "perimeter":
      return { type, rows: sanitizeInt(state.perimeter.rows, 2), cols: sanitizeInt(state.perimeter.cols, 2) };
    case "empty":
      return { type, rows: sanitizeInt(state.empty.rows, 1), cols: sanitizeInt(state.empty.cols, 1) };
    case "triangle":
      return { type, rows: sanitizeInt(state.triangle.rows, 2), cols: sanitizeInt(state.triangle.cols, 2) };
    case "astra":
      return { type, rays: sanitizeInt(state.astra.rays, 3), layers: sanitizeInt(state.astra.layers, 1) };
    case "hexagon":
      return { type, layers: sanitizeInt(state.hexagon.layers, 1) };
    case "disk-hex":
      return { type, layers: sanitizeInt(state.diskHex.layers, 1) };
  }
}

function toGridParams(topology: GridTopologyParams, shared: GridSharedParams): GridParams {
  switch (topology.type) {
    case "cell":
    case "perimeter":
    case "empty":
    case "triangle":
      return {
        ...shared,
        n: sanitizeInt(topology.rows, 1),
        m: sanitizeInt(topology.cols, 1),
        layers: 1,
      };
    case "astra":
      return {
        ...shared,
        n: sanitizeInt(topology.rays, 3),
        m: sanitizeInt(topology.layers, 1),
        layers: sanitizeInt(topology.layers, 1),
      };
    case "hexagon":
    case "disk-hex":
      return {
        ...shared,
        n: sanitizeInt(topology.layers, 1),
        m: sanitizeInt(topology.layers, 1),
        layers: sanitizeInt(topology.layers, 1),
      };
  }
}

function setRowsByType(
  type: RowColTopologyType,
  value: number,
  setState: Dispatch<SetStateAction<TopologyFormState>>,
): void {
  setState((prev) => ({ ...prev, [type]: { ...prev[type], rows: value } }));
}

function setColsByType(
  type: RowColTopologyType,
  value: number,
  setState: Dispatch<SetStateAction<TopologyFormState>>,
): void {
  setState((prev) => ({ ...prev, [type]: { ...prev[type], cols: value } }));
}

function sanitizeInt(value: number, min: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.round(value));
}

type InsertGraphDialogProps = {
  open: boolean;
  initialType?: GridType;
  canvasSize: { width: number; height: number };
  onGenerateOctaves123?: (octaves: 1 | 2 | 3) => void;
  onClose: () => void;
};

export function InsertGraphDialog({
  open,
  initialType = DEFAULT_INSERT_GRAPH_DIALOG_SETTINGS.initialType,
  canvasSize,
  onGenerateOctaves123,
  onClose,
}: InsertGraphDialogProps) {
  const {
    defaultWeight,
    defaultStiffness,
    stiffnessType,
    boundaryMode,
    stiffnessNormalizationMode,
    weightDistributionMode,
    rimWeightRatio,
    rimDampingFactor,
    simulationParams,
    createPresetGraph,
    setDefaults,
    setSimulationParams,
  } = useGraphStore();

  if (!open) {
    return null;
  }

  return (
    <InsertGraphForm
      open={open}
      initialType={initialType}
      formDefaults={DEFAULT_INSERT_GRAPH_DIALOG_SETTINGS}
      defaults={{
        weight: defaultWeight,
        stiffness: defaultStiffness,
        stiffnessType,
        boundaryMode,
        stiffnessNormalizationMode,
        weightDistributionMode,
        rimWeightRatio,
        rimDampingFactor,
        attenuation: simulationParams.attenuation,
        squareAttenuation: simulationParams.squareAttenuation,
      }}
      onApply={(values) => {
        const gridParams = toGridParams(values.topology, {
          stiffness: values.stiffness,
          weight: values.weight,
          stiffnessType: values.stiffnessType,
          width: canvasSize.width,
          height: canvasSize.height,
          boundaryMode: values.boundaryMode,
          stiffnessNormalizationMode: values.stiffnessNormalizationMode,
          weightDistributionMode: values.weightDistributionMode,
          rimWeightRatio: values.rimWeightRatio,
          rimDampingFactor: values.rimDampingFactor,
          defaultAttenuation: values.attenuation,
          defaultSquareAttenuation: values.squareAttenuation,
        });
        setDefaults({
          defaultWeight: values.weight,
          defaultStiffness: values.stiffness,
          stiffnessType: values.stiffnessType,
          boundaryMode: values.boundaryMode,
          stiffnessNormalizationMode: values.stiffnessNormalizationMode,
          weightDistributionMode: values.weightDistributionMode,
          rimWeightRatio: values.rimWeightRatio,
          rimDampingFactor: values.rimDampingFactor,
        });
        setSimulationParams({
          attenuation: values.attenuation,
          squareAttenuation: values.squareAttenuation,
        });
        createPresetGraph(values.topology.type, gridParams, {
          playingPointMode: values.playingPointMode,
          centerGroup: values.centerGroup,
        });
        if (values.generateOctaves123) {
          onGenerateOctaves123?.(values.generateOctavesCount);
        }
        onClose();
      }}
      onClose={onClose}
    />
  );
}
