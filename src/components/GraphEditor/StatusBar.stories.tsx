import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBarView } from "./StatusBar";

const meta = {
  title: "GraphEditor/StatusBar",
  component: StatusBarView,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StatusBarView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { text: "120 : 240" },
};

export const WithDotInfo: Story = {
  args: { text: "50 : 100 = dot[3] : non-fix, W:0.000001, U:0.2000, V:0.0000, input:; Lines: 1.000, 0.500" },
};

export const WithLineInfo: Story = {
  args: { text: "80 : 150 = line[1-2] : K:1.000000" },
};

export const Simulating: Story = {
  args: { text: "120 : 240 | generating buffer... 42%" },
};
