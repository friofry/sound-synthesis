import { useState } from "react";
import { DEFAULT_CELL_TEMPLATE_DIALOG_SETTINGS } from "../../../config/defaults";
import type { BoundaryMode } from "../../../engine/types";
import { useGraphStore } from "../../../store/graphStore";
import { MfcButton, MfcCheckbox, MfcDialog, MfcField, MfcNumberInput } from "../../ui/MfcDialog";

export type CellTemplateFormValues = {
  widthPoints: number;
  heightPoints: number;
  stiffness: number;
  weight: number;
  boundaryMode: Extract<BoundaryMode, "free" | "fixed">;
};

export type CellTemplateFormProps = {
  initialValues: CellTemplateFormValues;
  onApply: (values: CellTemplateFormValues) => void;
  onClose: () => void;
};

export function CellTemplateForm({ initialValues, onApply, onClose }: CellTemplateFormProps) {
  const [widthPoints, setWidthPoints] = useState(initialValues.widthPoints);
  const [heightPoints, setHeightPoints] = useState(initialValues.heightPoints);
  const [stiffness, setStiffness] = useState(initialValues.stiffness);
  const [weight, setWeight] = useState(initialValues.weight);
  const [fixedBorder, setFixedBorder] = useState(initialValues.boundaryMode === "fixed");

  return (
    <MfcDialog
      title="Cell template"
      open
      onClose={onClose}
      onSubmit={() => onApply({ widthPoints, heightPoints, stiffness, weight, boundaryMode: fixedBorder ? "fixed" : "free" })}
      width={300}
      actions={
        <>
          <MfcButton type="submit" defaultAction>
            OK
          </MfcButton>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
        </>
      }
    >
      <MfcField label="Width" labelWidth={96}>
        <MfcNumberInput min={1} value={widthPoints} onChange={setWidthPoints} />
      </MfcField>
      <MfcField label="Height" labelWidth={96}>
        <MfcNumberInput min={1} value={heightPoints} onChange={setHeightPoints} />
      </MfcField>
      <MfcField label="Default stiff" labelWidth={96}>
        <MfcNumberInput step="0.1" value={stiffness} onChange={setStiffness} />
      </MfcField>
      <MfcField label="Default weight" labelWidth={96}>
        <MfcNumberInput step="0.1" value={weight} onChange={setWeight} />
      </MfcField>
      <MfcCheckbox checked={fixedBorder} onChange={setFixedBorder}>
        Fixed border
      </MfcCheckbox>
    </MfcDialog>
  );
}

export function CellTemplateDialog() {
  const {
    cellTemplateDialog,
    closeCellTemplateDialog,
    createPresetGraph,
    setDefaults,
    stiffnessType,
    canvasSize,
  } = useGraphStore();

  if (!cellTemplateDialog.open) {
    return null;
  }

  return (
    <CellTemplateForm
      initialValues={DEFAULT_CELL_TEMPLATE_DIALOG_SETTINGS}
      onApply={(values) => {
        const n = Number.isFinite(values.heightPoints) ? Math.max(1, Math.floor(values.heightPoints)) : 1;
        const m = Number.isFinite(values.widthPoints) ? Math.max(1, Math.floor(values.widthPoints)) : 1;
        const safeStiffness = Number.isFinite(values.stiffness) ? values.stiffness : 1;
        const safeWeight = Number.isFinite(values.weight) ? values.weight : 1;

        setDefaults({
          defaultWeight: safeWeight,
          defaultStiffness: safeStiffness,
          boundaryMode: values.boundaryMode,
        });
        createPresetGraph("cell", {
          n,
          m,
          layers: 1,
          stiffness: safeStiffness,
          weight: safeWeight,
          boundaryMode: values.boundaryMode,
          stiffnessType,
          width: canvasSize.width,
          height: canvasSize.height,
        });
        closeCellTemplateDialog();
      }}
      onClose={closeCellTemplateDialog}
    />
  );
}
