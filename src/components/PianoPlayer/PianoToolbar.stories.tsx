import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PianoToolbar } from "./PianoToolbar";

const meta = {
  title: "PianoPlayer/PianoToolbar",
  component: PianoToolbar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onGenerateOne: fn(),
    onGenerateInstrument: fn(),
    onToggleRecording: fn(),
    onSaveInstrument: fn(),
    onLoadInstrumentFile: fn(),
    onSaveSnc: fn(),
    onLoadSncFile: fn(),
    onPlayPopcorn: fn(),
  },
} satisfies Meta<typeof PianoToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { recording: false },
};

export const Recording: Story = {
  args: { recording: true },
};

export const Disabled: Story = {
  args: { recording: false, disabled: true },
};
