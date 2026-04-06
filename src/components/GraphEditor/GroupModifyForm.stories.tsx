import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GroupModifyForm } from "./dialogs/GroupModifyDialog";

const meta = {
  title: "GraphEditor/GroupModifyForm",
  component: GroupModifyForm,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 380, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
  args: { onClose: fn(), onApply: fn() },
} satisfies Meta<typeof GroupModifyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
