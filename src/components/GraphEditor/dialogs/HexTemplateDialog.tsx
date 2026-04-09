import { useState } from "react";
import { DEFAULT_HEX_TEMPLATE_DIALOG_SETTINGS } from "../../../config/defaults";
import type { BoundaryMode } from "../../../engine/types";
import { useGraphStore } from "../../../store/graphStore";
import { MfcButton, MfcCheckbox, MfcDialog, MfcField, MfcNumberInput } from "../../ui/MfcDialog";

export type HexTemplateFormValues = {
  layers: number;
  stiffness: number;
  weight: number;
  boundaryMode: Extract<BoundaryMode, "free" | "fixed">;
};

export type HexTemplateFormProps = {
  initialValues: HexTemplateFormValues;
  onApply: (values: HexTemplateFormValues) => void;
  onClose: () => void;
};

export function HexTemplateForm({ initialValues, onApply, onClose }: HexTemplateFormProps) {
  const [layers, setLayers] = useState(initialValues.layers);
  const [stiffness, setStiffness] = useState(initialValues.stiffness);
  const [weight, setWeight] = useState(initialValues.weight);
  const [fixedBorder, setFixedBorder] = useState(initialValues.boundaryMode === "fixed");

  return (
    <MfcDialog
      title="Hex template"
      open
      onClose={onClose}
      onSubmit={() => onApply({ layers, stiffness, weight, boundaryMode: fixedBorder ? "fixed" : "free" })}
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
      <MfcField label="Number of layers" labelWidth={96}>
        <MfcNumberInput min={1} value={layers} onChange={setLayers} />
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

export function HexTemplateDialog() {
  const {
    hexTemplateDialog,
    closeHexTemplateDialog,
    createPresetGraph,
    setDefaults,
    stiffnessType,
    canvasSize,
  } = useGraphStore();

  if (!hexTemplateDialog.open) {
    return null;
  }

  return (
    <HexTemplateForm
      initialValues={DEFAULT_HEX_TEMPLATE_DIALOG_SETTINGS}
      onApply={(values) => {
        const safeLayers = Number.isFinite(values.layers) ? Math.max(1, Math.floor(values.layers)) : 1;
        const safeStiffness = Number.isFinite(values.stiffness) ? values.stiffness : 1;
        const safeWeight = Number.isFinite(values.weight) ? values.weight : 1;

        setDefaults({
          defaultWeight: safeWeight,
          defaultStiffness: safeStiffness,
          boundaryMode: values.boundaryMode,
        });
        createPresetGraph("hexagon", {
          n: safeLayers,
          m: safeLayers,
          layers: safeLayers,
          stiffness: safeStiffness,
          weight: safeWeight,
          boundaryMode: values.boundaryMode,
          stiffnessType,
          width: canvasSize.width,
          height: canvasSize.height,
        });
        closeHexTemplateDialog();
      }}
      onClose={closeHexTemplateDialog}
    />
  );
}
