import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MfcRadioGroup } from "./MfcDialog";

function RadioGroupDemo(props: {
  options: { value: string; label: string }[];
  initial: string;
  direction?: "row" | "column";
  pushLike?: boolean;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <MfcRadioGroup
      name="demo"
      value={value}
      options={props.options}
      onChange={setValue}
      direction={props.direction}
      pushLike={props.pushLike}
    />
  );
}

const WAVE_OPTIONS = [
  { value: "sine", label: "Sine" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
];

const METHOD_OPTIONS = [
  { value: "euler", label: "Euler-Cramer" },
  { value: "runge-kutta", label: "Runge-Kutta" },
];

const meta: Meta = {
  title: "UI/MfcRadioGroup",
  component: MfcRadioGroup,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ background: "#ece9d8", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const Column: Story = {
  render: () => <RadioGroupDemo options={WAVE_OPTIONS} initial="sine" direction="column" />,
};

export const Row: Story = {
  render: () => <RadioGroupDemo options={WAVE_OPTIONS} initial="square" direction="row" />,
};

export const PushLike: Story = {
  render: () => <RadioGroupDemo options={METHOD_OPTIONS} initial="euler" direction="row" pushLike />,
};
