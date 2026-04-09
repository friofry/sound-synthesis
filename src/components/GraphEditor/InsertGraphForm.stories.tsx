import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { InsertGraphForm } from "./dialogs/InsertGraphDialog";

const meta = {
  title: "GraphEditor/InsertGraphForm",
  component: InsertGraphForm,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 550, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
  args: { onClose: fn(), onApply: fn() },
} satisfies Meta<typeof InsertGraphForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    defaults: {
      weight: 0.000001,
      stiffness: 1,
      stiffnessType: "isotropic",
      boundaryMode: "free",
      stiffnessNormalizationMode: "none",
      weightDistributionMode: "uniform",
      rimWeightRatio: 1.5,
      rimDampingFactor: 0.7,
      attenuation: 4,
      squareAttenuation: 0.08,
    },
  },
};

export const Hexagonal: Story = {
  args: {
    open: true,
    initialType: "hexagon",
    defaults: {
      weight: 0.000001,
      stiffness: 1,
      stiffnessType: "tetradic",
      boundaryMode: "fixed",
      stiffnessNormalizationMode: "by-edge-length",
      weightDistributionMode: "by-node-area",
      rimWeightRatio: 2,
      rimDampingFactor: 0.6,
      attenuation: 4,
      squareAttenuation: 0.08,
    },
  },
};
