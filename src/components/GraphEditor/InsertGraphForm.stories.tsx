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
    defaults: { weight: 0.000001, stiffness: 1, fixedBorder: false, stiffnessType: "isotropic" },
  },
};

export const Hexagonal: Story = {
  args: {
    open: true,
    initialType: "hexagon",
    defaults: { weight: 0.000001, stiffness: 1, fixedBorder: true, stiffnessType: "tetradic" },
  },
};
