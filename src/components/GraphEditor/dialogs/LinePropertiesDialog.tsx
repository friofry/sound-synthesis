import { useState } from "react";
import { useGraphStore } from "../../../store/graphStore";
import { MfcButton, MfcDialog, MfcField, MfcGroupBox, MfcNumberInput } from "../../ui/MfcDialog";

export type LinePropertiesFormProps = {
  initialStiffness: number;
  onApply: (stiffness: number) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function LinePropertiesForm({ initialStiffness, onApply, onDelete, onClose }: LinePropertiesFormProps) {
  const [stiffness, setStiffness] = useState(initialStiffness);

  return (
    <MfcDialog
      title="Line Dialog"
      open
      onClose={onClose}
      onSubmit={() => onApply(Number.isFinite(stiffness) ? stiffness : initialStiffness)}
      width={340}
      actions={
        <>
          <MfcButton className="push-left" variant="danger" onClick={onDelete}>
            Delete
          </MfcButton>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
          <MfcButton type="submit" defaultAction>
            OK
          </MfcButton>
        </>
      }
    >
      <MfcGroupBox legend="Line Properties">
        <MfcField label="Stiffness" labelWidth={90}>
          <MfcNumberInput step="0.01" value={stiffness} onChange={setStiffness} />
        </MfcField>
      </MfcGroupBox>
    </MfcDialog>
  );
}

export function LinePropertiesDialog() {
  const { graph, lineDialog, closeLineDialog, updateGraph, setDefaults } = useGraphStore();
  const lineIndex = lineDialog.payload?.lineIndex ?? -1;
  const line = lineIndex >= 0 ? graph.lines[lineIndex] : null;

  if (!lineDialog.open || !line) {
    return null;
  }

  return (
    <LinePropertiesForm
      key={lineIndex}
      initialStiffness={line.k}
      onApply={(stiffness) => {
        updateGraph((next) => next.setLineK(line.dot1, line.dot2, stiffness));
        setDefaults({ defaultStiffness: stiffness });
        closeLineDialog();
      }}
      onDelete={() => {
        updateGraph((next) => next.delLine(line.dot1, line.dot2));
        closeLineDialog();
      }}
      onClose={closeLineDialog}
    />
  );
}
