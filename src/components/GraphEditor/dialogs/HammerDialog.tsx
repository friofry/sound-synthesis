import { useState } from "react";
import { DEFAULT_HAMMER_DIALOG_SETTINGS } from "../../../config/defaults";
import type {
  HammerAttackMode,
  HammerDistributionMode,
  HammerPlayingPointMode,
  HammerRepeatForceMode,
  HammerRepeatStopMode,
  HammerSettings,
} from "../../../store/graphStore";
import { useGraphStore } from "../../../store/graphStore";
import { MfcButton, MfcDialog, MfcField, MfcGroupBox, MfcNumberInput } from "../../ui/MfcDialog";

type HammerFormValues = HammerSettings;

type HammerFormProps = {
  initialValues: HammerFormValues;
  onApply: (values: HammerFormValues) => void;
  onClose: () => void;
};

const WEIGHT_MIN = 0.000001;
const WEIGHT_MAX = 2;
const VELOCITY_MIN = -5000;
const VELOCITY_MAX = 5000;
const RESTITUTION_MIN = 0;
const RESTITUTION_MAX = 1;
const ATTENUATION_MIN = 0;
const ATTENUATION_MAX = 20;
const SQUARE_ATTENUATION_MIN = 0;
const SQUARE_ATTENUATION_MAX = 1;
const RADIUS_MIN = 4;
const RADIUS_MAX = 240;
const REPEAT_HZ_MIN = 0.5;
const REPEAT_HZ_MAX = 24;
const REPEAT_COUNT_MIN = 1;
const REPEAT_COUNT_MAX = 128;

export function HammerDialogForm({ initialValues, onApply, onClose }: HammerFormProps) {
  const [distribution, setDistribution] = useState<HammerDistributionMode>(initialValues.distribution);
  const [weight, setWeight] = useState(initialValues.weight);
  const [velocity, setVelocity] = useState(initialValues.velocity);
  const [restitution, setRestitution] = useState(initialValues.restitution);
  const [attenuation, setAttenuation] = useState(initialValues.attenuation);
  const [squareAttenuation, setSquareAttenuation] = useState(initialValues.squareAttenuation);
  const [radius, setRadius] = useState(initialValues.radius);
  const [playingPointMode, setPlayingPointMode] = useState<HammerPlayingPointMode>(initialValues.playingPointMode);
  const [attackMode, setAttackMode] = useState<HammerAttackMode>(initialValues.attackMode);
  const [repeatHz, setRepeatHz] = useState(initialValues.repeatHz);
  const [repeatForceMode, setRepeatForceMode] = useState<HammerRepeatForceMode>(initialValues.repeatForceMode);
  const [repeatStopMode, setRepeatStopMode] = useState<HammerRepeatStopMode>(initialValues.repeatStopMode);
  const [repeatCount, setRepeatCount] = useState(initialValues.repeatCount);

  return (
    <MfcDialog
      title="Hammer Strike"
      open
      width={440}
      onClose={onClose}
      onSubmit={() =>
        onApply({
          distribution,
          weight,
          velocity,
          restitution,
          attenuation,
          squareAttenuation,
          radius,
          playingPointMode,
          attackMode,
          repeatHz,
          repeatForceMode,
          repeatStopMode,
          repeatCount,
        })
      }
      actions={
        <>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
          <MfcButton type="submit" defaultAction>
            Apply
          </MfcButton>
        </>
      }
    >
      <MfcGroupBox legend="Strike Parameters">
        <MfcField label="Distribution" labelWidth={130}>
          <select value={distribution} onChange={(event) => setDistribution(event.target.value as HammerDistributionMode)}>
            <option value="equivalent">Equivalent</option>
            <option value="smoothed">Smoothed</option>
          </select>
        </MfcField>
        <MfcField label="Hammer Mass" labelWidth={130}>
          <div className="mfc-slider-field">
            <MfcNumberInput step="0.000001" min={WEIGHT_MIN} value={weight} onChange={setWeight} />
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
        <MfcField label="Velocity" labelWidth={130}>
          <div className="mfc-slider-field">
            <MfcNumberInput step="1" min={VELOCITY_MIN} max={VELOCITY_MAX} value={velocity} onChange={setVelocity} />
            <input
              type="range"
              min={VELOCITY_MIN}
              max={VELOCITY_MAX}
              step={1}
              value={clamp(velocity, VELOCITY_MIN, VELOCITY_MAX)}
              onChange={(event) => setVelocity(Number(event.target.value))}
            />
          </div>
        </MfcField>
        <MfcField label="Restitution" labelWidth={130}>
          <div className="mfc-slider-field">
            <MfcNumberInput step="0.001" min={RESTITUTION_MIN} max={RESTITUTION_MAX} value={restitution} onChange={setRestitution} />
            <input
              type="range"
              min={RESTITUTION_MIN}
              max={RESTITUTION_MAX}
              step={0.001}
              value={clamp(restitution, RESTITUTION_MIN, RESTITUTION_MAX)}
              onChange={(event) => setRestitution(Number(event.target.value))}
            />
          </div>
        </MfcField>
        <MfcField label="Radius" labelWidth={130}>
          <div className="mfc-slider-field">
            <MfcNumberInput step="1" min={RADIUS_MIN} value={radius} onChange={setRadius} />
            <input
              type="range"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step={1}
              value={clamp(radius, RADIUS_MIN, RADIUS_MAX)}
              onChange={(event) => setRadius(Number(event.target.value))}
            />
          </div>
        </MfcField>
      </MfcGroupBox>
      <MfcGroupBox legend="Damping">
        <MfcField label="Linear" labelWidth={130}>
          <div className="mfc-slider-field">
            <MfcNumberInput step="0.01" min={ATTENUATION_MIN} value={attenuation} onChange={setAttenuation} />
            <input
              type="range"
              min={ATTENUATION_MIN}
              max={ATTENUATION_MAX}
              step={0.01}
              value={clamp(attenuation, ATTENUATION_MIN, ATTENUATION_MAX)}
              onChange={(event) => setAttenuation(Number(event.target.value))}
            />
          </div>
        </MfcField>
        <MfcField label="Square" labelWidth={130}>
          <div className="mfc-slider-field">
            <MfcNumberInput
              step="0.001"
              min={SQUARE_ATTENUATION_MIN}
              value={squareAttenuation}
              onChange={setSquareAttenuation}
            />
            <input
              type="range"
              min={SQUARE_ATTENUATION_MIN}
              max={SQUARE_ATTENUATION_MAX}
              step={0.001}
              value={clamp(squareAttenuation, SQUARE_ATTENUATION_MIN, SQUARE_ATTENUATION_MAX)}
              onChange={(event) => setSquareAttenuation(Number(event.target.value))}
            />
          </div>
        </MfcField>
      </MfcGroupBox>
      <MfcGroupBox legend="Playing Point">
        <MfcField label="Placement" labelWidth={130}>
          <select value={playingPointMode} onChange={(event) => setPlayingPointMode(event.target.value as HammerPlayingPointMode)}>
            <option value="impact-point">At impact point</option>
            <option value="graph-center">At graph center</option>
          </select>
        </MfcField>
      </MfcGroupBox>
      <MfcGroupBox legend="Attack">
        <MfcField label="Mode" labelWidth={130}>
          <select value={attackMode} onChange={(event) => setAttackMode(event.target.value as HammerAttackMode)}>
            <option value="single">Single strike (per release)</option>
            <option value="repeat">Repeat strikes after release</option>
          </select>
        </MfcField>
        {attackMode === "repeat" ? (
          <>
            <MfcField label="Rate (Hz)" labelWidth={130}>
              <div className="mfc-slider-field">
                <MfcNumberInput
                  step="0.5"
                  min={REPEAT_HZ_MIN}
                  max={REPEAT_HZ_MAX}
                  value={repeatHz}
                  onChange={setRepeatHz}
                />
                <input
                  type="range"
                  min={REPEAT_HZ_MIN}
                  max={REPEAT_HZ_MAX}
                  step={0.5}
                  value={clamp(repeatHz, REPEAT_HZ_MIN, REPEAT_HZ_MAX)}
                  onChange={(event) => setRepeatHz(Number(event.target.value))}
                />
              </div>
            </MfcField>
            <MfcField label="Force" labelWidth={130}>
              <select
                value={repeatForceMode}
                onChange={(event) => setRepeatForceMode(event.target.value as HammerRepeatForceMode)}
              >
                <option value="constant">Constant strength</option>
                <option value="fading">Fading (each hit weaker)</option>
              </select>
            </MfcField>
            <MfcField label="Until" labelWidth={130}>
              <select
                value={repeatStopMode}
                onChange={(event) => setRepeatStopMode(event.target.value as HammerRepeatStopMode)}
              >
                <option value="next-click">Next mouse click</option>
                <option value="count">Fixed number of strikes</option>
              </select>
            </MfcField>
            {repeatStopMode === "count" ? (
              <MfcField label="Strikes" labelWidth={130}>
                <div className="mfc-slider-field">
                  <MfcNumberInput
                    step="1"
                    min={REPEAT_COUNT_MIN}
                    max={REPEAT_COUNT_MAX}
                    value={repeatCount}
                    onChange={setRepeatCount}
                  />
                  <input
                    type="range"
                    min={REPEAT_COUNT_MIN}
                    max={REPEAT_COUNT_MAX}
                    step={1}
                    value={clamp(repeatCount, REPEAT_COUNT_MIN, REPEAT_COUNT_MAX)}
                    onChange={(event) => setRepeatCount(Number(event.target.value))}
                  />
                </div>
              </MfcField>
            ) : null}
          </>
        ) : null}
      </MfcGroupBox>
    </MfcDialog>
  );
}

export function HammerDialog() {
  const { hammerDialog, hammerSettings, setHammerSettings, closeHammerDialog } = useGraphStore();

  if (!hammerDialog.open) {
    return null;
  }

  return (
    <HammerDialogForm
      initialValues={hammerSettings ?? DEFAULT_HAMMER_DIALOG_SETTINGS}
      onApply={(values) => {
        setHammerSettings({
          distribution: values.distribution,
          weight: Number.isFinite(values.weight) ? values.weight : hammerSettings.weight,
          velocity: Number.isFinite(values.velocity) ? values.velocity : hammerSettings.velocity,
          restitution: Number.isFinite(values.restitution) ? values.restitution : hammerSettings.restitution,
          attenuation: Number.isFinite(values.attenuation) ? values.attenuation : hammerSettings.attenuation,
          squareAttenuation: Number.isFinite(values.squareAttenuation)
            ? values.squareAttenuation
            : hammerSettings.squareAttenuation,
          radius: Number.isFinite(values.radius) ? values.radius : hammerSettings.radius,
          playingPointMode: values.playingPointMode,
          attackMode: values.attackMode,
          repeatHz: Number.isFinite(values.repeatHz) ? values.repeatHz : hammerSettings.repeatHz,
          repeatForceMode: values.repeatForceMode,
          repeatStopMode: values.repeatStopMode,
          repeatCount: Number.isFinite(values.repeatCount) ? values.repeatCount : hammerSettings.repeatCount,
        });
        closeHammerDialog();
      }}
      onClose={closeHammerDialog}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
