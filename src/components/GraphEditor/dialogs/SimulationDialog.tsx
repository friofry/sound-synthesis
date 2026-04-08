import { useState } from "react";
import {
  SIMULATION_BACKEND_OPTIONS,
  type SimMethod,
  type SimulationBackend,
  type SimulationCaptureMode,
  type SimulationPrecision,
  type SimulationSubstepsMode,
} from "../../../engine/types";
import { useGraphStore } from "../../../store/graphStore";
import { usePianoStore } from "../../../store/pianoStore";
import { useViewerStore } from "../../../store/viewerStore";
import { MfcButton, MfcDialog, MfcField, MfcGroupBox, MfcNumberInput, MfcRadioGroup, MfcSelect } from "../../ui/MfcDialog";
import { DEFAULT_SIMULATION_PRECISION, resolveDefaultSimulationBackend } from "../../../engine/simulationDefaults";

export type SimulationFormValues = {
  outputMode: SimulationCaptureMode;
  sampleRate: number;
  lengthK: number;
  attenuation: number;
  squareAttenuation: number;
  method: SimMethod;
  backend: SimulationBackend;
  precision: SimulationPrecision;
  substepsMode: SimulationSubstepsMode;
  substeps: number;
};

export type SimulationFormProps = {
  initialValues: SimulationFormValues;
  onSubmit: (values: SimulationFormValues) => void;
  onClose: () => void;
};

export function SimulationForm({ initialValues, onSubmit, onClose }: SimulationFormProps) {
  const [outputMode, setOutputMode] = useState<SimulationCaptureMode>(initialValues.outputMode);
  const [sampleRate, setSampleRate] = useState(initialValues.sampleRate);
  const [lengthK, setLengthK] = useState(initialValues.lengthK);
  const [attenuation, setAttenuation] = useState(initialValues.attenuation);
  const [squareAttenuation, setSquareAttenuation] = useState(initialValues.squareAttenuation);
  const [method, setMethod] = useState(initialValues.method);
  const [backend, setBackend] = useState<SimulationBackend>(initialValues.backend);
  const [precision, setPrecision] = useState<SimulationPrecision>(initialValues.precision);
  const [substepsMode, setSubstepsMode] = useState<SimulationSubstepsMode>(initialValues.substepsMode);
  const [substeps, setSubsteps] = useState(initialValues.substeps);

  return (
    <MfcDialog
      title="Simulation Output"
      open
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          outputMode,
          sampleRate,
          lengthK,
          attenuation,
          squareAttenuation,
          method,
          backend,
          precision,
          substepsMode,
          substeps: Number.isFinite(substeps) ? Math.max(1, Math.round(substeps)) : 1,
        })
      }
      width={430}
      actions={
        <>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
          <MfcButton type="submit" defaultAction>
            {outputMode === "playing-point-only" ? "Generate Audio Buffer" : "Run Full Simulation"}
          </MfcButton>
        </>
      }
    >
      <MfcGroupBox legend="Result Mode">
        <MfcRadioGroup
          name="simulation-output-mode"
          value={outputMode}
          onChange={(value) => {
            if (value === "playing-point-only" || value === "full") {
              setOutputMode(value as SimulationCaptureMode);
            }
          }}
          options={[
            { value: "playing-point-only", label: "Audio only (playing point)" },
            { value: "full", label: "Full frames (viewer replay)" },
          ]}
        />
      </MfcGroupBox>

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

      <MfcGroupBox legend="Optimization">
        <MfcField label="Backend" labelWidth={130}>
          <MfcSelect
            value={backend}
            onChange={(value) => setBackend(value)}
            options={[...SIMULATION_BACKEND_OPTIONS]}
          />
        </MfcField>
        <MfcField label="Precision" labelWidth={130}>
          <MfcRadioGroup
            name="simulation-precision"
            value={String(precision)}
            onChange={(value) => {
              if (value === "32" || value === "64") {
                setPrecision(Number(value) as SimulationPrecision);
              }
            }}
            direction="row"
            options={[
              { value: "64", label: "64" },
              { value: "32", label: "32" },
            ]}
          />
        </MfcField>
        <MfcField label="Substeps" labelWidth={130}>
          <MfcSelect
            value={substepsMode === "adaptive" ? "adaptive" : String(substeps)}
            onChange={(value) => {
              if (value === "adaptive") {
                setSubstepsMode("adaptive");
                return;
              }
              if (value === "1" || value === "2" || value === "4" || value === "8") {
                setSubstepsMode("fixed");
                setSubsteps(Number(value));
              }
            }}
            options={[
              { value: "1", label: "1x" },
              { value: "2", label: "2x" },
              { value: "4", label: "4x" },
              { value: "8", label: "8x" },
              { value: "adaptive", label: "Adaptive" },
            ]}
          />
        </MfcField>
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
  const setActiveBuffer = usePianoStore((state) => state.setActiveBuffer);

  if (!simulationDialogOpen) {
    return null;
  }

  return (
    <SimulationForm
      initialValues={{
        outputMode: "playing-point-only",
        sampleRate: simulationParams.sampleRate,
        lengthK: simulationParams.lengthK,
        attenuation: simulationParams.attenuation,
        squareAttenuation: simulationParams.squareAttenuation,
        method: simulationParams.method,
        backend: resolveDefaultSimulationBackend(simulationParams.method, DEFAULT_SIMULATION_PRECISION),
        precision: DEFAULT_SIMULATION_PRECISION,
        substepsMode: simulationParams.substepsMode ?? "fixed",
        substeps: simulationParams.substeps ?? 1,
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
          substepsMode: values.substepsMode,
          substeps: Number.isFinite(values.substeps) ? Math.max(1, Math.round(values.substeps)) : 1,
        } as const;

        setSimulationParams(nextParams);
        if (values.outputMode === "full") {
          setSimulationState({
            isSimulating: true,
            simulationProgress: 0,
            simulationResult: null,
          });
          stop();
          resetFrame();
        } else {
          setSimulationState({
            isSimulating: true,
            simulationProgress: 0,
          });
        }

        worker.onmessage = (event: MessageEvent<import("../../../engine/types").SimulationWorkerMessage>) => {
          const message = event.data;
          if (message.type === "progress") {
            setSimulationState({
              simulationProgress: Math.round((message.completed / message.total) * 100),
            });
            return;
          }

          if (message.type === "complete") {
            if (values.outputMode === "playing-point-only") {
              if (message.outputMode !== "playing-point-only") {
                setSimulationState({
                  isSimulating: false,
                  simulationProgress: 0,
                });
                worker.terminate();
                window.alert("Simulation worker did not return playing point audio");
                return;
              }
              setSimulationState({
                isSimulating: false,
                simulationProgress: 100,
              });
              setActiveBuffer(message.playingPointBuffer, nextParams.sampleRate);
              worker.terminate();
              closeSimulationDialog();
              return;
            }

            if (message.outputMode !== "full") {
              setSimulationState({
                isSimulating: false,
                simulationProgress: 0,
                simulationResult: null,
              });
              worker.terminate();
              window.alert("Simulation worker did not return full simulation data");
              return;
            }
            setSimulationState({
              isSimulating: false,
              simulationProgress: 100,
              simulationResult: message.result,
            });
            setActiveBuffer(message.result.playingPointBuffer, nextParams.sampleRate);
            worker.terminate();
            closeSimulationDialog();
            return;
          }

          if (message.type === "error") {
            if (values.outputMode === "full") {
              setSimulationState({
                isSimulating: false,
                simulationProgress: 0,
                simulationResult: null,
              });
            } else {
              setSimulationState({
                isSimulating: false,
                simulationProgress: 0,
              });
            }
            worker.terminate();
            window.alert(message.message);
          }
        };

        worker.postMessage({
          graph: graph.toGraphData(),
          params: nextParams,
          outputMode: values.outputMode,
          backend: values.backend,
          precision: values.precision,
        });
      }}
      onClose={closeSimulationDialog}
    />
  );
}
