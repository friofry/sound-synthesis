import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DEFAULT_HEX_TEMPLATE_DIALOG_SETTINGS } from "../../config/defaults";
import { HexTemplateForm } from "./dialogs/HexTemplateDialog";

const meta = {
  title: "GraphEditor/HexTemplateForm",
  component: HexTemplateForm,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 320, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
  args: { initialValues: DEFAULT_HEX_TEMPLATE_DIALOG_SETTINGS, onClose: fn(), onApply: fn() },
} satisfies Meta<typeof HexTemplateForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
