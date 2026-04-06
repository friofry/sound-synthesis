import { useEffect, useState } from "react";
import { useGraphStore } from "../../../store/graphStore";
import { MfcButton, MfcCheckbox, MfcDialog, MfcField, MfcNumberInput } from "../../ui/MfcDialog";

export type CellTemplateFormValues = {
  widthPoints: number;
  heightPoints: number;
  stiffness: number;
  weight: number;
  fixedBorder: boolean;
};

export type CellTemplateFormProps = {
  onApply: (values: CellTemplateFormValues) => void;
  onClose: () => void;
};

export function CellTemplateForm({ onApply, onClose }: CellTemplateFormProps) {
  const [widthPoints, setWidthPoints] = useState(3);
  const [heightPoints, setHeightPoints] = useState(3);
  const [stiffness, setStiffness] = useState(1);
  const [weight, setWeight] = useState(1);
  const [fixedBorder, setFixedBorder] = useState(false);

  return (
    <MfcDialog
      title="Cell template"
      open
      onClose={onClose}
      onSubmit={() => onApply({ widthPoints, heightPoints, stiffness, weight, fixedBorder })}
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

  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (cellTemplateDialog.open) {
      setResetKey((k) => k + 1);
    }
  }, [cellTemplateDialog.open]);

  if (!cellTemplateDialog.open) {
    return null;
  }

  return (
    <CellTemplateForm
      key={resetKey}
      onApply={(values) => {
        const n = Number.isFinite(values.heightPoints) ? Math.max(1, Math.floor(values.heightPoints)) : 1;
        const m = Number.isFinite(values.widthPoints) ? Math.max(1, Math.floor(values.widthPoints)) : 1;
        const safeStiffness = Number.isFinite(values.stiffness) ? values.stiffness : 1;
        const safeWeight = Number.isFinite(values.weight) ? values.weight : 1;

        setDefaults({
          defaultWeight: safeWeight,
          defaultStiffness: safeStiffness,
          fixedBorder: values.fixedBorder,
        });
        createPresetGraph("cell", {
          n,
          m,
          layers: 1,
          stiffness: safeStiffness,
          weight: safeWeight,
          fixedBorder: values.fixedBorder,
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
