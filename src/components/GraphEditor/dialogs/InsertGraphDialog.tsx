import { useState } from "react";
import type { GridType, StiffnessType } from "../../../engine/types";
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
  MfcRadioGroup,
  MfcSelect,
} from "../../ui/MfcDialog";

export type InsertGraphFormProps = {
  open: boolean;
  initialType?: GridType;
  defaults: {
    weight: number;
    stiffness: number;
    fixedBorder: boolean;
    stiffnessType: StiffnessType;
  };
  onApply: (values: {
    type: GridType;
    n: number;
    m: number;
    layers: number;
    weight: number;
    stiffness: number;
    fixedBorder: boolean;
    stiffnessType: StiffnessType;
    playingPointMode: PlayingPointMode;
    centerGroup: CenterGroupModifyOptions;
    generateOctaves123: boolean;
  }) => void;
  onClose: () => void;
};

export function InsertGraphForm({
  open,
  initialType = "hexagon",
  defaults,
  onApply,
  onClose,
}: InsertGraphFormProps) {
  const [type, setType] = useState<GridType>(initialType);
  const [n, setN] = useState(25);
  const [m, setM] = useState(25);
  const [layers, setLayers] = useState(5);
  const [weight, setWeight] = useState(defaults.weight);
  const [stiffness, setStiffness] = useState(defaults.stiffness);
  const [border, setBorder] = useState(defaults.fixedBorder);
  const [stiffType, setStiffType] = useState<StiffnessType>(defaults.stiffnessType);
  const [playingPointMode, setPlayingPointMode] = useState<PlayingPointMode>("center");
  const [applyCenterGroup, setApplyCenterGroup] = useState(true);
  const [maxAmplitude, setMaxAmplitude] = useState(0.75);
  const [distribution, setDistribution] = useState<DistributionMode>("smoothed");
  const [fixMode, setFixMode] = useState<FixMode>("none");
  const [groupWeight, setGroupWeight] = useState(defaults.weight);
  const [groupWeightTouched, setGroupWeightTouched] = useState(false);
  const [groupStiffness, setGroupStiffness] = useState(defaults.stiffness);
  const [groupStiffnessTouched, setGroupStiffnessTouched] = useState(false);
  const [generateOctaves123, setGenerateOctaves123] = useState(false);

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
      onSubmit={() => onApply({
        type,
        n: Number.isFinite(n) ? Math.max(1, n) : 1,
        m: Number.isFinite(m) ? Math.max(1, m) : 1,
        layers: Number.isFinite(layers) ? Math.max(1, layers) : 1,
        stiffness: Number.isFinite(stiffness) ? stiffness : 1,
        weight: Number.isFinite(weight) ? weight : 0.000001,
        fixedBorder: border,
        stiffnessType: stiffType,
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
      })}
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
        <MfcRadioGroup
          name="graph-type"
          value={type}
          onChange={setType}
          options={[
            { value: "empty", label: "Empty" },
            { value: "perimeter", label: "Perimeter" },
            { value: "cell", label: "Cell" },
            { value: "triangle", label: "Triangulated Cell" },
            { value: "astra", label: "Astra" },
            { value: "hexagon", label: "Hexagonal" },
          ]}
        />
      </MfcGroupBox>

      <MfcGroupBox legend="Graph Params">
        <MfcField label="Width (N)" labelWidth={110}>
          <MfcNumberInput min={1} value={n} onChange={setN} />
        </MfcField>
        <MfcField label="Height (M)" labelWidth={110}>
          <MfcNumberInput min={1} value={m} onChange={setM} />
        </MfcField>
        <MfcField label="Layers" labelWidth={110}>
          <MfcNumberInput min={1} value={layers} onChange={setLayers} />
        </MfcField>
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
        <MfcCheckbox checked={border} onChange={setBorder}>
          Fixed Border
        </MfcCheckbox>
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
        <MfcCheckbox checked={generateOctaves123} onChange={setGenerateOctaves123}>
          Generate octaves (1,2,3)
        </MfcCheckbox>
      </MfcGroupBox>
    </MfcDialog>
  );
}

type InsertGraphDialogProps = {
  open: boolean;
  initialType?: GridType;
  canvasSize: { width: number; height: number };
  onGenerateOctaves123?: () => void;
  onClose: () => void;
};

export function InsertGraphDialog({
  open,
  initialType = "hexagon",
  canvasSize,
  onGenerateOctaves123,
  onClose,
}: InsertGraphDialogProps) {
  const {
    defaultWeight,
    defaultStiffness,
    fixedBorder,
    stiffnessType,
    createPresetGraph,
    setDefaults,
  } = useGraphStore();

  if (!open) {
    return null;
  }

  return (
    <InsertGraphForm
      open={open}
      initialType={initialType}
      defaults={{
        weight: defaultWeight,
        stiffness: defaultStiffness,
        fixedBorder,
        stiffnessType,
      }}
      onApply={(values) => {
        setDefaults({
          defaultWeight: values.weight,
          defaultStiffness: values.stiffness,
          fixedBorder: values.fixedBorder,
          stiffnessType: values.stiffnessType,
        });
        createPresetGraph(values.type, {
          n: values.n,
          m: values.m,
          layers: values.layers,
          stiffness: values.stiffness,
          weight: values.weight,
          fixedBorder: values.fixedBorder,
          stiffnessType: values.stiffnessType,
          width: canvasSize.width,
          height: canvasSize.height,
        }, {
          playingPointMode: values.playingPointMode,
          centerGroup: values.centerGroup,
        });
        if (values.generateOctaves123) {
          onGenerateOctaves123?.();
        }
        onClose();
      }}
      onClose={onClose}
    />
  );
}
