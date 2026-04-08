import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SimulationForm } from "./dialogs/SimulationDialog";
import {
  DEFAULT_SIMULATION_BACKEND,
  DEFAULT_SIMULATION_METHOD,
  DEFAULT_SIMULATION_PRECISION,
  DEFAULT_SIMULATION_SUBSTEPS,
  DEFAULT_SIMULATION_SUBSTEPS_MODE,
} from "../../engine/simulationDefaults";

const meta = {
  title: "GraphEditor/SimulationForm",
  component: SimulationForm,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 400, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
  args: { onClose: fn(), onSubmit: fn() },
} satisfies Meta<typeof SimulationForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialValues: {
      outputMode: "playing-point-only",
      sampleRate: 8000,
      lengthK: 8,
      attenuation: 4,
      squareAttenuation: 0.08,
      method: DEFAULT_SIMULATION_METHOD,
      backend: DEFAULT_SIMULATION_BACKEND,
      precision: DEFAULT_SIMULATION_PRECISION,
      substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
      substeps: DEFAULT_SIMULATION_SUBSTEPS,
    },
  },
};

export const RungeKutta: Story = {
  args: {
    initialValues: {
      outputMode: "full",
      sampleRate: 44100,
      lengthK: 16,
      attenuation: 2,
      squareAttenuation: 0.02,
      method: "runge-kutta",
      backend: DEFAULT_SIMULATION_BACKEND,
      precision: DEFAULT_SIMULATION_PRECISION,
      substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
      substeps: DEFAULT_SIMULATION_SUBSTEPS,
    },
  },
};
