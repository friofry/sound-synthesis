import type { Meta, StoryObj } from "@storybook/react-vite";
import { MfcGroupBox, MfcField, MfcCheckbox } from "./MfcDialog";

const meta = {
  title: "UI/MfcGroupBox",
  component: MfcGroupBox,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 360, background: "#ece9d8", padding: 8 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MfcGroupBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    legend: "Parameters",
    children: (
      <>
        <MfcField label="Sample Rate" labelWidth={100}>
          <input type="number" defaultValue={8000} />
        </MfcField>
        <MfcField label="Length" labelWidth={100}>
          <input type="number" defaultValue={1024} />
        </MfcField>
        <MfcCheckbox checked={false} onChange={() => {}}>
          Fixed border
        </MfcCheckbox>
      </>
    ),
  },
};
