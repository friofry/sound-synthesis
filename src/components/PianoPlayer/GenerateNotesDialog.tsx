import { useEffect, useState } from "react";
import { MfcButton, MfcCheckbox, MfcDialog, MfcField, MfcGroupBox, MfcNumberInput, MfcRadioGroup } from "../ui/MfcDialog";
import type { SimMethod } from "../../engine/types";
import "./GenerateNotesDialog.css";

export type GenerateNotesDialogValues = {
  octaves: 1 | 2 | 3;
  attenuation: number;
  squareAttenuation: number;
  durationMs: number;
  tillSilence: boolean;
  sampleRate: 8000 | 22050 | 44100;
  method: SimMethod;
};

type GenerateNotesDialogProps = {
  open: boolean;
  initialValues: GenerateNotesDialogValues;
  onClose: () => void;
  onSubmit: (values: GenerateNotesDialogValues) => void;
};

export function GenerateNotesDialog({
  open,
  initialValues,
  onClose,
  onSubmit,
}: GenerateNotesDialogProps) {
  const [octaves, setOctaves] = useState<1 | 2 | 3>(initialValues.octaves);
  const [attenuation, setAttenuation] = useState(initialValues.attenuation);
  const [squareAttenuation, setSquareAttenuation] = useState(initialValues.squareAttenuation);
  const [durationMs, setDurationMs] = useState(initialValues.durationMs);
  const [tillSilence, setTillSilence] = useState(initialValues.tillSilence);
  const [sampleRate, setSampleRate] = useState<8000 | 22050 | 44100>(initialValues.sampleRate);
  const [method, setMethod] = useState<SimMethod>(initialValues.method);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOctaves(initialValues.octaves);
    setAttenuation(initialValues.attenuation);
    setSquareAttenuation(initialValues.squareAttenuation);
    setDurationMs(initialValues.durationMs);
    setTillSilence(initialValues.tillSilence);
    setSampleRate(initialValues.sampleRate);
    setMethod(initialValues.method);
  }, [open, initialValues]);

  return (
    <MfcDialog
      title="Create Piano"
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          octaves,
          attenuation: Math.max(0, attenuation),
          squareAttenuation: Math.max(0, squareAttenuation),
          durationMs: Math.max(1, Math.round(durationMs)),
          tillSilence,
          sampleRate,
          method,
        })
      }
      width={460}
    >
      <div className="create-piano-layout">
        <div className="create-piano-left">
          <MfcGroupBox legend="Generate Octaves">
            <MfcRadioGroup
              name="generate-octaves"
              value={String(octaves)}
              onChange={(value) => {
                if (value === "1" || value === "2" || value === "3") {
                  setOctaves(Number(value) as 1 | 2 | 3);
                }
              }}
              direction="row"
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
              ]}
            />
          </MfcGroupBox>

          <MfcGroupBox legend="Annuations">
            <MfcField label="Linear" labelWidth={58}>
              <MfcNumberInput step="0.1" min={0} value={attenuation} onChange={setAttenuation} />
            </MfcField>
            <MfcField label="Square" labelWidth={58}>
              <MfcNumberInput step="0.001" min={0} value={squareAttenuation} onChange={setSquareAttenuation} />
            </MfcField>
          </MfcGroupBox>

          <MfcGroupBox legend="Algorithm">
            <MfcRadioGroup
              name="generate-notes-method"
              value={method}
              onChange={(value) => setMethod(value)}
              direction="row"
              pushLike
              options={[
                { value: "euler", label: "Euler-Cramer" },
                { value: "runge-kutta", label: "Runge-Kutta" },
              ]}
            />
          </MfcGroupBox>

          <MfcGroupBox legend="Duration">
            <div className="create-piano-duration-row">
              <MfcField label="milSeconds" labelWidth={72}>
                <MfcNumberInput min={1} value={durationMs} onChange={setDurationMs} />
              </MfcField>
              <MfcCheckbox checked={tillSilence} onChange={setTillSilence}>
                till Silence
              </MfcCheckbox>
            </div>
          </MfcGroupBox>
        </div>

        <div className="create-piano-right">
          <div className="create-piano-buttons">
            <MfcButton type="submit" defaultAction>
              Generate!
            </MfcButton>
            <MfcButton onClick={onClose}>Cancel</MfcButton>
          </div>

          <MfcGroupBox legend="Sample Rate">
            <MfcRadioGroup
              name="sample-rate"
              value={String(sampleRate)}
              onChange={(value) => {
                if (value === "8000" || value === "22050" || value === "44100") {
                  setSampleRate(Number(value) as 8000 | 22050 | 44100);
                }
              }}
              direction="column"
              options={[
                { value: "44100", label: "44100" },
                { value: "22050", label: "22050" },
                { value: "8000", label: "8000" },
              ]}
            />
          </MfcGroupBox>
        </div>
      </div>
    </MfcDialog>
  );
}
