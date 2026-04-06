import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DotPropertiesForm } from "./dialogs/DotPropertiesDialog";

const meta = {
  title: "GraphEditor/DotPropertiesForm",
  component: DotPropertiesForm,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 320, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
  args: { onClose: fn(), onApply: fn() },
} satisfies Meta<typeof DotPropertiesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialValues: { weight: 0.000001, velocity: 0, position: 0.2, fixed: false },
  },
};

export const FixedPoint: Story = {
  args: {
    initialValues: { weight: 1, velocity: 0.5, position: 0.8, fixed: true },
  },
};
