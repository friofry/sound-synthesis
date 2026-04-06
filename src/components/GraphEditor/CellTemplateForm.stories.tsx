import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CellTemplateForm } from "./dialogs/CellTemplateDialog";

const meta = {
  title: "GraphEditor/CellTemplateForm",
  component: CellTemplateForm,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 350, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
  args: { onClose: fn(), onApply: fn() },
} satisfies Meta<typeof CellTemplateForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
