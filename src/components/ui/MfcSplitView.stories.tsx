import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MfcSplitView } from "./MfcSplitView";

const panelStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  padding: 8,
  fontSize: 12,
};

const meta = {
  title: "UI/MfcSplitView",
  component: MfcSplitView,
  args: {
    children: [<div />, <div />],
  },
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 900, height: 460, background: "#d4d0c8", padding: 10 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MfcSplitView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <MfcSplitView defaultRatio={0.55}>
      <div style={{ ...panelStyle, background: "#fff" }}>Left pane</div>
      <div style={{ ...panelStyle, background: "#f6f6f6" }}>Right pane</div>
    </MfcSplitView>
  ),
};

export const Vertical: Story = {
  render: () => (
    <MfcSplitView orientation="vertical" defaultRatio={0.6}>
      <div style={{ ...panelStyle, background: "#fff" }}>Top pane</div>
      <div style={{ ...panelStyle, background: "#f6f6f6" }}>Bottom pane</div>
    </MfcSplitView>
  ),
};

export const Nested: Story = {
  render: () => (
    <MfcSplitView defaultRatio={0.38}>
      <div style={{ ...panelStyle, background: "#fff" }}>Main graph/editor</div>
      <MfcSplitView orientation="vertical" defaultRatio={0.65}>
        <div style={{ ...panelStyle, background: "#fff" }}>3D viewer</div>
        <MfcSplitView orientation="vertical" defaultRatio={0.4}>
          <div style={{ ...panelStyle, background: "#f6f6f6" }}>Oscillogram</div>
          <div style={{ ...panelStyle, background: "#f0f0f0" }}>Keyboard</div>
        </MfcSplitView>
      </MfcSplitView>
    </MfcSplitView>
  ),
};

export const FourPanes: Story = {
  render: () => (
    <MfcSplitView orientation="vertical" defaultRatios={[0.5, 0.125, 0.125, 0.25]} minPaneSize={70}>
      <div style={{ ...panelStyle, background: "#fff" }}>Membrane Viewer</div>
      <div style={{ ...panelStyle, background: "#f8f8f8" }}>Oscillogram</div>
      <div style={{ ...panelStyle, background: "#f3f3f3" }}>Frequency Analyzer</div>
      <div style={{ ...panelStyle, background: "#ededed" }}>Piano Keyboard</div>
    </MfcSplitView>
  ),
};
