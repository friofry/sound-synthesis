import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorToolbarView } from "./EditorToolbar";

const meta = {
  title: "GraphEditor/EditorToolbar",
  component: EditorToolbarView,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ background: "#d4d0c8", padding: 4 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onSelectTool: fn(),
    onToggleHammerTool: fn(),
    onAddCellGraph: fn(),
    onAddHexGraph: fn(),
    onReprepareAndGenerate: fn(),
    onNewGraph: fn(),
    onLoadGraphFile: fn(),
    onSaveGraph: fn(),
    onZoomIn: fn(),
    onZoomOut: fn(),
  },
} satisfies Meta<typeof EditorToolbarView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { tool: "add-point-link" },
};

export const DragPoint: Story = {
  args: { tool: "drag-point" },
};

export const DeleteMode: Story = {
  args: { tool: "delete-point" },
};
