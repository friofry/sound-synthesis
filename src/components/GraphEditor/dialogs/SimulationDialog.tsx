import { useState } from "react";
import type { SimMethod } from "../../../engine/types";
import { useGraphStore } from "../../../store/graphStore";
import { useViewerStore } from "../../../store/viewerStore";
import { MfcButton, MfcDialog, MfcField, MfcGroupBox, MfcNumberInput, MfcRadioGroup } from "../../ui/MfcDialog";

export type SimulationFormValues = {
  sampleRate: number;
  lengthK: number;
  attenuation: number;
  squareAttenuation: number;
  method: SimMethod;
};

export type SimulationFormProps = {
  initialValues: SimulationFormValues;
  onSubmit: (values: SimulationFormValues) => void;
  onClose: () => void;
};

export function SimulationForm({ initialValues, onSubmit, onClose }: SimulationFormProps) {
  const [sampleRate, setSampleRate] = useState(initialValues.sampleRate);
  const [lengthK, setLengthK] = useState(initialValues.lengthK);
  const [attenuation, setAttenuation] = useState(initialValues.attenuation);
  const [squareAttenuation, setSquareAttenuation] = useState(initialValues.squareAttenuation);
  const [method, setMethod] = useState(initialValues.method);

  return (
    <MfcDialog
      title="Create Buffer Dialog"
      open
      onClose={onClose}
      onSubmit={() => onSubmit({ sampleRate, lengthK, attenuation, squareAttenuation, method })}
      width={430}
      actions={
        <>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
          <MfcButton type="submit" defaultAction>
            Generate
          </MfcButton>
        </>
      }
    >
      <MfcGroupBox legend="Parameters">
        <MfcField label="Sample Rate" labelWidth={130}>
          <MfcNumberInput min={1000} value={sampleRate} onChange={setSampleRate} />
        </MfcField>
        <MfcField label="Samples (K)" labelWidth={130}>
          <MfcNumberInput min={1} value={lengthK} onChange={setLengthK} />
        </MfcField>
        <MfcField label="Linear Damping" labelWidth={130}>
          <MfcNumberInput step="0.1" value={attenuation} onChange={setAttenuation} />
        </MfcField>
        <MfcField label="Square Damping" labelWidth={130}>
          <MfcNumberInput step="0.001" value={squareAttenuation} onChange={setSquareAttenuation} />
        </MfcField>
      </MfcGroupBox>

      <MfcGroupBox legend="Algorithm">
        <MfcRadioGroup
          name="simulation-method"
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
    </MfcDialog>
  );
}

export function SimulationDialog() {
  const {
    graph,
    playingPoint,
    simulationDialogOpen,
    simulationParams,
    closeSimulationDialog,
    setSimulationParams,
    setSimulationState,
  } = useGraphStore();
  const resetFrame = useViewerStore((state) => state.resetFrame);
  const stop = useViewerStore((state) => state.stop);

  if (!simulationDialogOpen) {
    return null;
  }

  return (
    <SimulationForm
      initialValues={{
        sampleRate: simulationParams.sampleRate,
        lengthK: simulationParams.lengthK,
        attenuation: simulationParams.attenuation,
        squareAttenuation: simulationParams.squareAttenuation,
        method: simulationParams.method,
      }}
      onSubmit={(values) => {
        const worker = new Worker(new URL("../../../engine/simulation.worker.ts", import.meta.url), {
          type: "module",
        });

        const nextParams = {
          sampleRate: Number.isFinite(values.sampleRate) ? values.sampleRate : simulationParams.sampleRate,
          lengthK: Number.isFinite(values.lengthK) ? values.lengthK : simulationParams.lengthK,
          attenuation: Number.isFinite(values.attenuation) ? values.attenuation : simulationParams.attenuation,
          squareAttenuation: Number.isFinite(values.squareAttenuation) ? values.squareAttenuation : simulationParams.squareAttenuation,
          method: values.method,
          playingPoint: playingPoint ?? graph.findFirstPlayableDot(),
        } as const;

        setSimulationParams(nextParams);
        setSimulationState({
          isSimulating: true,
          simulationProgress: 0,
          simulationResult: null,
        });
        stop();
        resetFrame();

        worker.onmessage = (event: MessageEvent<import("../../../engine/types").SimulationWorkerMessage>) => {
          const message = event.data;
          if (message.type === "progress") {
            setSimulationState({
              simulationProgress: Math.round((message.completed / message.total) * 100),
            });
            return;
          }

          if (message.type === "complete") {
            setSimulationState({
              isSimulating: false,
              simulationProgress: 100,
              simulationResult: message.result,
            });
            worker.terminate();
            closeSimulationDialog();
            return;
          }

          if (message.type === "error") {
            setSimulationState({
              isSimulating: false,
              simulationProgress: 0,
              simulationResult: null,
            });
            worker.terminate();
            window.alert(message.message);
          }
        };

        worker.postMessage({
          graph: graph.toGraphData(),
          params: nextParams,
        });
      }}
      onClose={closeSimulationDialog}
    />
  );
}
