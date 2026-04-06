import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LinePropertiesForm } from "./dialogs/LinePropertiesDialog";

const meta = {
  title: "GraphEditor/LinePropertiesForm",
  component: LinePropertiesForm,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 260, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
  args: { onClose: fn(), onApply: fn(), onDelete: fn() },
} satisfies Meta<typeof LinePropertiesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { initialStiffness: 1.0 },
};

export const HighStiffness: Story = {
  args: { initialStiffness: 25.5 },
};
