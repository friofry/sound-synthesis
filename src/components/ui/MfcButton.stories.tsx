import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MfcButton } from "./MfcDialog";

const meta = {
  title: "UI/MfcButton",
  component: MfcButton,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "radio", options: ["normal", "danger"] },
    defaultAction: { control: "boolean" },
    type: { control: "radio", options: ["button", "submit", "reset"] },
  },
  args: { onClick: fn(), children: "Button" },
} satisfies Meta<typeof MfcButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: { children: "OK", variant: "normal" },
};

export const Danger: Story = {
  args: { children: "Delete", variant: "danger" },
};

export const DefaultAction: Story = {
  args: { children: "Apply", defaultAction: true },
};

export const ButtonRow: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 6 }}>
      <MfcButton variant="danger">Delete</MfcButton>
      <MfcButton>Cancel</MfcButton>
      <MfcButton defaultAction>OK</MfcButton>
    </div>
  ),
};
