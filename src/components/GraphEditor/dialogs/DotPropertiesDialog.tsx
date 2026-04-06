import { useState } from "react";
import { useGraphStore } from "../../../store/graphStore";
import { MfcButton, MfcCheckbox, MfcDialog, MfcField, MfcNumberInput } from "../../ui/MfcDialog";

export type DotPropertiesFormValues = {
  weight: number;
  velocity: number;
  position: number;
  fixed: boolean;
};

export type DotPropertiesFormProps = {
  initialValues: DotPropertiesFormValues;
  onApply: (values: DotPropertiesFormValues) => void;
  onClose: () => void;
};

const WEIGHT_MIN = 0.000001;
const WEIGHT_MAX = 2;
const VELOCITY_MIN = -2;
const VELOCITY_MAX = 2;
const POSITION_MIN = -2;
const POSITION_MAX = 2;

export function DotPropertiesForm({ initialValues, onApply, onClose }: DotPropertiesFormProps) {
  const [weight, setWeight] = useState(initialValues.weight);
  const [velocity, setVelocity] = useState(initialValues.velocity);
  const [position, setPosition] = useState(initialValues.position);
  const [fixed, setFixed] = useState(initialValues.fixed);

  return (
    <MfcDialog
      title="Point parameters"
      open
      onClose={onClose}
      onSubmit={() => onApply({ weight, velocity, position, fixed })}
      width={360}
    >
      <div className="mfc-dot-layout">
        <div className="mfc-dot-fields">
          <MfcField label="weight" labelWidth={52}>
            <div className="mfc-slider-field">
              <MfcNumberInput step="0.000001" value={weight} onChange={setWeight} />
              <input
                type="range"
                min={WEIGHT_MIN}
                max={WEIGHT_MAX}
                step={0.000001}
                value={clamp(weight, WEIGHT_MIN, WEIGHT_MAX)}
                onChange={(event) => setWeight(Number(event.target.value))}
              />
            </div>
          </MfcField>
          <MfcField label="velocity" labelWidth={52}>
            <div className="mfc-slider-field">
              <MfcNumberInput step="0.001" value={velocity} onChange={setVelocity} />
              <input
                type="range"
                min={VELOCITY_MIN}
                max={VELOCITY_MAX}
                step={0.001}
                value={clamp(velocity, VELOCITY_MIN, VELOCITY_MAX)}
                onChange={(event) => setVelocity(Number(event.target.value))}
              />
            </div>
          </MfcField>
          <MfcField label="position" labelWidth={52}>
            <div className="mfc-slider-field">
              <MfcNumberInput step="0.001" value={position} onChange={setPosition} />
              <input
                type="range"
                min={POSITION_MIN}
                max={POSITION_MAX}
                step={0.001}
                value={clamp(position, POSITION_MIN, POSITION_MAX)}
                onChange={(event) => setPosition(Number(event.target.value))}
              />
            </div>
          </MfcField>
        </div>
        <div className="mfc-dot-actions">
          <MfcButton type="submit" defaultAction>
            OK
          </MfcButton>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
        </div>
      </div>
      <div className="mfc-dot-fixed">
        <MfcCheckbox checked={fixed} onChange={setFixed}>
          Fixed
        </MfcCheckbox>
      </div>
    </MfcDialog>
  );
}

export function DotPropertiesDialog() {
  const { graph, dotDialog, closeDotDialog, updateGraph, setDefaults } = useGraphStore();
  const dotIndex = dotDialog.payload?.dotIndex ?? -1;
  const dot = dotIndex >= 0 ? graph.dots[dotIndex] : null;

  if (!dotDialog.open || !dot) {
    return null;
  }

  return (
    <DotPropertiesForm
      key={dotIndex}
      initialValues={{ weight: dot.weight, velocity: dot.v, position: dot.u, fixed: dot.fixed }}
      onApply={(values) => {
        updateGraph((next) => {
          next.setDotProps(dotIndex, {
            weight: Number.isFinite(values.weight) ? values.weight : dot.weight,
            v: Number.isFinite(values.velocity) ? values.velocity : dot.v,
            u: Number.isFinite(values.position) ? values.position : dot.u,
            fixed: values.fixed,
          });
        });
        setDefaults({ defaultWeight: Number.isFinite(values.weight) ? values.weight : undefined });
        closeDotDialog();
      }}
      onClose={closeDotDialog}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
