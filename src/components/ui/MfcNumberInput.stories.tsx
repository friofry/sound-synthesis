import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MfcNumberInput } from "./MfcDialog";

function MfcNumberInputDemo(props: { value: number; step?: string; min?: number; max?: number }) {
  const [value, setValue] = useState(props.value);
  return (
    <div style={{ width: 200, background: "#ece9d8", padding: 8 }}>
      <MfcNumberInput value={value} onChange={setValue} step={props.step} min={props.min} max={props.max} />
      <div style={{ fontSize: 11, marginTop: 4, color: "#555" }}>Current: {value}</div>
    </div>
  );
}

const meta: Meta = {
  title: "UI/MfcNumberInput",
  component: MfcNumberInput,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => <MfcNumberInputDemo value={42} />,
};

export const WithStep: Story = {
  render: () => <MfcNumberInputDemo value={0.5} step="0.01" />,
};

export const WithMinMax: Story = {
  render: () => <MfcNumberInputDemo value={5} min={0} max={10} />,
};

export const SmallValue: Story = {
  render: () => <MfcNumberInputDemo value={0.000001} step="0.000001" />,
};
