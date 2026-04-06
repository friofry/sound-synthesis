import type { Meta, StoryObj } from "@storybook/react-vite";
import { MfcField } from "./MfcDialog";

const meta = {
  title: "UI/MfcField",
  component: MfcField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 340, background: "#ece9d8", padding: 8 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MfcField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
  args: {
    label: "Name:",
    children: <input type="text" defaultValue="Hello" />,
  },
};

export const NumberInput: Story = {
  args: {
    label: "Frequency:",
    children: <input type="number" defaultValue={440} />,
  },
};

export const CustomLabelWidth: Story = {
  args: {
    label: "Long Label Here:",
    labelWidth: 160,
    children: <input type="text" defaultValue="value" />,
  },
};

export const WithSelect: Story = {
  args: {
    label: "Mode:",
    children: (
      <select defaultValue="euler">
        <option value="euler">Euler-Cramer</option>
        <option value="runge-kutta">Runge-Kutta</option>
      </select>
    ),
  },
};
