import { useState } from "react";
import { DEFAULT_GROUP_MODIFY_DIALOG_SETTINGS } from "../../../config/defaults";
import { useGraphStore } from "../../../store/graphStore";
import { MfcButton, MfcDialog, MfcField, MfcGroupBox, MfcNumberInput } from "../../ui/MfcDialog";

export type DistributionMode = "equivalent" | "smoothed";
export type FixMode = "none" | "fix" | "unfix";

export type GroupModifyFormValues = {
  maxAmplitude: number;
  maxWeight: number;
  stiffness: number;
  distribution: DistributionMode;
  fixMode: FixMode;
};

export type GroupModifyFormProps = {
  initialValues: GroupModifyFormValues;
  onApply: (values: GroupModifyFormValues) => void;
  onClose: () => void;
};

export function GroupModifyForm({ initialValues, onApply, onClose }: GroupModifyFormProps) {
  const [maxAmplitude, setMaxAmplitude] = useState(initialValues.maxAmplitude);
  const [maxWeight, setMaxWeight] = useState(initialValues.maxWeight);
  const [stiffness, setStiffness] = useState(initialValues.stiffness);
  const [distribution, setDistribution] = useState<DistributionMode>(initialValues.distribution);
  const [fixMode, setFixMode] = useState<FixMode>(initialValues.fixMode);

  return (
    <MfcDialog
      title="Modify Group"
      open
      onClose={onClose}
      onSubmit={() => onApply({ maxAmplitude, maxWeight, stiffness, distribution, fixMode })}
      width={430}
      actions={
        <>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
          <MfcButton type="submit" defaultAction>
            Apply
          </MfcButton>
        </>
      }
    >
      <MfcGroupBox legend="Group Parameters">
        <MfcField label="Max Amplitude" labelWidth={120}>
          <MfcNumberInput step="0.01" value={maxAmplitude} onChange={setMaxAmplitude} />
        </MfcField>
        <MfcField label="Max Weight" labelWidth={120}>
          <MfcNumberInput step="0.000001" value={maxWeight} onChange={setMaxWeight} />
        </MfcField>
        <MfcField label="Stiffness" labelWidth={120}>
          <MfcNumberInput step="0.01" value={stiffness} onChange={setStiffness} />
        </MfcField>
        <MfcField label="Distribution" labelWidth={120}>
          <select value={distribution} onChange={(event) => setDistribution(event.target.value as DistributionMode)}>
            <option value="equivalent">Equivalent</option>
            <option value="smoothed">Smoothed</option>
          </select>
        </MfcField>
        <MfcField label="Fix / Unfix" labelWidth={120}>
          <select value={fixMode} onChange={(event) => setFixMode(event.target.value as FixMode)}>
            <option value="none">No change</option>
            <option value="fix">Fix points</option>
            <option value="unfix">Unfix points</option>
          </select>
        </MfcField>
      </MfcGroupBox>
    </MfcDialog>
  );
}

export function GroupModifyDialog() {
  const { groupDialog, closeGroupDialog, updateGraph } = useGraphStore();
  const rect = groupDialog.payload?.rect;

  if (!groupDialog.open || !rect) {
    return null;
  }

  return (
    <GroupModifyForm
      initialValues={DEFAULT_GROUP_MODIFY_DIALOG_SETTINGS}
      onApply={(values) => {
        const cx = (rect.x1 + rect.x2) / 2;
        const cy = (rect.y1 + rect.y2) / 2;
        const radius = Math.max(1, Math.hypot(rect.x2 - cx, rect.y2 - cy));

        updateGraph((next) => {
          const selected = next.dots
            .map((dot, idx) => ({ dot, idx }))
            .filter(
              ({ dot }) =>
                dot.x >= Math.min(rect.x1, rect.x2) &&
                dot.x <= Math.max(rect.x1, rect.x2) &&
                dot.y >= Math.min(rect.y1, rect.y2) &&
                dot.y <= Math.max(rect.y1, rect.y2),
            );

          selected.forEach(({ dot, idx }) => {
            const dist = Math.hypot(dot.x - cx, dot.y - cy);
            const factor = values.distribution === "smoothed" ? Math.max(0, 1 - dist / radius) : 1;
            next.setDotProps(idx, {
              u: values.maxAmplitude * factor,
              weight: values.maxWeight * Math.max(0.1, factor),
              fixed: values.fixMode === "none" ? dot.fixed : values.fixMode === "fix",
            });
          });

          for (const line of next.lines) {
            const inA = selected.some((entry) => entry.idx === line.dot1);
            const inB = selected.some((entry) => entry.idx === line.dot2);
            if (inA && inB) {
              line.k = values.stiffness;
            }
          }
        });

        closeGroupDialog();
      }}
      onClose={closeGroupDialog}
    />
  );
}
