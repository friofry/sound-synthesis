import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MfcToolbar, type MfcToolbarItem, type MfcToolbarSeparator } from "./MfcToolbar";

type DemoItem = MfcToolbarItem<string>;

const ITEMS: (DemoItem | MfcToolbarSeparator)[] = [
  { id: "bold", label: "B", title: "Bold" },
  { id: "italic", label: "I", title: "Italic" },
  { id: "underline", label: "U", title: "Underline" },
  { kind: "separator", id: "sep-1" },
  { id: "align-left", label: "L", title: "Align left" },
  { id: "align-center", label: "C", title: "Align center" },
  { id: "align-right", label: "R", title: "Align right" },
];

function ToolbarDemo(props: { orientation?: "horizontal" | "vertical" }) {
  const [selected, setSelected] = useState("bold");
  return (
    <MfcToolbar
      items={ITEMS}
      selectedId={selected}
      onSelect={setSelected}
      orientation={props.orientation}
    />
  );
}

const meta: Meta = {
  title: "UI/MfcToolbar",
  component: MfcToolbar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ background: "#d4d0c8", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const Horizontal: Story = {
  render: () => <ToolbarDemo orientation="horizontal" />,
};

export const Vertical: Story = {
  render: () => <ToolbarDemo orientation="vertical" />,
};

export const WithDisabledItems: Story = {
  render: () => {
    const items: (DemoItem | MfcToolbarSeparator)[] = [
      { id: "a", label: "Enabled" },
      { id: "b", label: "Disabled", disabled: true },
      { id: "c", label: "Also OK" },
    ];
    const [sel, setSel] = useState("a");
    return <MfcToolbar items={items} selectedId={sel} onSelect={setSel} />;
  },
};
