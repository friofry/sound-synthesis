import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MfcMenuBar, type MfcMenuBarItem } from "./MfcMenu";

const MENU_ITEMS: MfcMenuBarItem[] = [
  {
    id: "file",
    label: "File",
    items: [
      { id: "new", label: "New", shortcut: "Ctrl+N" },
      { id: "open", label: "Open...", shortcut: "Ctrl+O" },
      { kind: "separator", id: "sep-1" },
      { id: "save", label: "Save", shortcut: "Ctrl+S" },
      { id: "save-as", label: "Save As..." },
      { kind: "separator", id: "sep-2" },
      { id: "exit", label: "Exit" },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { id: "undo", label: "Undo", shortcut: "Ctrl+Z", disabled: true },
      { kind: "separator", id: "sep-3" },
      { id: "cut", label: "Cut", shortcut: "Ctrl+X" },
      { id: "copy", label: "Copy", shortcut: "Ctrl+C" },
      { id: "paste", label: "Paste", shortcut: "Ctrl+V" },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [{ id: "about", label: "About..." }],
  },
];

function withActions(items: MfcMenuBarItem[]): MfcMenuBarItem[] {
  return items.map((menu) => ({
    ...menu,
    items: menu.items.map((item) =>
      "kind" in item ? item : { ...item, onClick: fn() },
    ),
  }));
}

const meta = {
  title: "UI/MfcMenuBar",
  component: MfcMenuBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { items: withActions(MENU_ITEMS) },
} satisfies Meta<typeof MfcMenuBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCustomLabel: StoryObj = {
  render: () => (
    <MfcMenuBar
      items={withActions(MENU_ITEMS)}
      renderLabel={(item) => <span style={{ textDecoration: "underline" }}>{item.label}</span>}
    />
  ),
};
