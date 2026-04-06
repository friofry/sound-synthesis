import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MfcCheckbox } from "./MfcDialog";

function MfcCheckboxDemo(props: { checked: boolean; label: string }) {
  const [checked, setChecked] = useState(props.checked);
  return (
    <MfcCheckbox checked={checked} onChange={setChecked}>
      {props.label}
    </MfcCheckbox>
  );
}

const meta: Meta = {
  title: "UI/MfcCheckbox",
  component: MfcCheckbox,
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

export const Unchecked: Story = {
  render: () => <MfcCheckboxDemo checked={false} label="Fixed border" />,
};

export const Checked: Story = {
  render: () => <MfcCheckboxDemo checked={true} label="Fixed border" />,
};
