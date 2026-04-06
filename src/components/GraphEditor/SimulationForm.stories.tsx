import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SimulationForm } from "./dialogs/SimulationDialog";

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
      sampleRate: 8000,
      lengthK: 8,
      attenuation: 4,
      squareAttenuation: 0.08,
      method: "euler",
      backend: "wasm-hotloop",
      precision: 64,
    },
  },
};

export const RungeKutta: Story = {
  args: {
    initialValues: {
      sampleRate: 44100,
      lengthK: 16,
      attenuation: 2,
      squareAttenuation: 0.02,
      method: "runge-kutta",
      backend: "wasm-hotloop",
      precision: 64,
    },
  },
};
