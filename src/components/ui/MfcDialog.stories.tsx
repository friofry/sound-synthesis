import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MfcDialog, MfcField, MfcGroupBox, MfcButton } from "./MfcDialog";

const meta = {
  title: "UI/MfcDialog",
  component: MfcDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { onClose: fn() },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 400, background: "#d4d0c8" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MfcDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
  args: {
    title: "Sample Dialog",
    open: true,
    children: (
      <MfcGroupBox legend="Settings">
        <MfcField label="Name:">
          <input type="text" defaultValue="Node 1" />
        </MfcField>
      </MfcGroupBox>
    ),
  },
};

export const WithActions: Story = {
  args: {
    title: "Confirm Action",
    open: true,
    children: <p style={{ margin: 0, fontSize: 12 }}>Are you sure you want to proceed?</p>,
    actions: (
      <>
        <MfcButton>Cancel</MfcButton>
        <MfcButton defaultAction>OK</MfcButton>
      </>
    ),
  },
};

export const Wide: Story = {
  args: {
    title: "Wide Dialog",
    open: true,
    width: 500,
    children: (
      <>
        <MfcGroupBox legend="Input">
          <MfcField label="Frequency:" labelWidth={90}>
            <input type="number" defaultValue={440} />
          </MfcField>
          <MfcField label="Amplitude:" labelWidth={90}>
            <input type="number" defaultValue={0.5} step={0.01} />
          </MfcField>
        </MfcGroupBox>
      </>
    ),
    actions: (
      <>
        <MfcButton>Cancel</MfcButton>
        <MfcButton defaultAction>Apply</MfcButton>
      </>
    ),
  },
};

export const Closed: Story = {
  args: {
    title: "Hidden",
    open: false,
    children: <p>You should not see this.</p>,
  },
};
