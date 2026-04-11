import { useRef, type ChangeEvent, type CSSProperties } from "react";
import { MfcToolbar, type MfcToolbarItem, type MfcToolbarSeparator } from "../ui/MfcToolbar";

type PianoToolbarProps = {
  recording: boolean;
  disabled?: boolean;
  onGenerateOne: () => void;
  onGenerateInstrument: () => void;
  onToggleRecording: () => void;
  onSaveInstrument: () => void;
  onLoadInstrumentFile: (file: File) => void | Promise<void>;
  onSaveSnc: () => void;
  onLoadSncFile: (file: File) => void | Promise<void>;
  onPlayPopcorn: () => void | Promise<void>;
  navigationButton?: {
    label: string;
    title?: string;
    text: string;
    onClick: () => void;
  };
};

type PianoActionId =
  | "none"
  | "navigate"
  | "one"
  | "generate"
  | "record"
  | "stop"
  | "saveIns"
  | "loadIns"
  | "saveSnc"
  | "loadSnc"
  | "popcorn";

type PianoToolbarButton = MfcToolbarItem<PianoActionId> & {
  spriteIndex?: number;
  text?: string;
  disabled?: boolean;
};

type PianoToolbarElement = PianoToolbarButton | MfcToolbarSeparator;

export function PianoToolbar({
  recording,
  disabled = false,
  onGenerateOne,
  onGenerateInstrument,
  onToggleRecording,
  onSaveInstrument,
  onLoadInstrumentFile,
  onSaveSnc,
  onLoadSncFile,
  onPlayPopcorn,
  navigationButton,
}: PianoToolbarProps) {
  const instrumentInputRef = useRef<HTMLInputElement | null>(null);
  const sncInputRef = useRef<HTMLInputElement | null>(null);

  const handleInstrumentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    if (file) {
      await onLoadInstrumentFile(file);
    }
    event.target.value = "";
  };

  const handleSncChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    if (file) {
      await onLoadSncFile(file);
    }
    event.target.value = "";
  };

  const items: PianoToolbarElement[] = [
    {
      id: "one",
      label: "Generate one note",
      title: "Generate one note",
      spriteIndex: 0,
    },
    {
      id: "generate",
      label: "Generate instrument",
      title: "Generate instrument",
      spriteIndex: 1,
    },
    { kind: "separator", id: "sep-1" },
    {
      id: "record",
      label: "Record",
      title: "Record",
      spriteIndex: 2,
      disabled: recording,
    },
    {
      id: "stop",
      label: "Stop",
      title: "Stop",
      spriteIndex: 3,
      disabled: !recording,
    },
    { kind: "separator", id: "sep-2" },
    {
      id: "saveIns",
      label: "Save instrument",
      title: "Save instrument",
      spriteIndex: 4,
    },
    {
      id: "loadIns",
      label: "Load instrument",
      title: "Load instrument",
      spriteIndex: 5,
    },
    { kind: "separator", id: "sep-3" },
    {
      id: "saveSnc",
      label: "Save melody to file",
      title: "Save melody to file",
      spriteIndex: 6,
    },
    {
      id: "loadSnc",
      label: "Play melody from file (SNC, WAV)",
      title: "Play melody from file (SNC, WAV)",
      spriteIndex: 7,
    },
    ...(navigationButton
      ? [
          { kind: "separator" as const, id: "sep-nav" },
          {
            id: "popcorn" as const,
            label: "Play popcorn.snc",
            title: "Play popcorn.snc from library",
            text: "🍿",
          },
          {
            id: "navigate" as const,
            label: navigationButton.label,
            title: navigationButton.title ?? navigationButton.label,
            text: navigationButton.text,
          },
        ]
      : [
          {
            id: "popcorn" as const,
            label: "Play popcorn.snc",
            title: "Play popcorn.snc from library",
            text: "🍿",
          },
        ]),
  ];

  const buttonItems = items.map((entry) =>
    "kind" in entry ? entry : { ...entry, disabled: entry.disabled ?? disabled },
  );

  return (
    <div className="toolbar-panel piano-toolbar-panel">
      <MfcToolbar
        items={buttonItems}
        selectedId={"none"}
        onSelect={(id) => {
          switch (id) {
            case "one":
              onGenerateOne();
              return;
            case "navigate":
              navigationButton?.onClick();
              return;
            case "generate":
              onGenerateInstrument();
              return;
            case "record":
            case "stop":
              onToggleRecording();
              return;
            case "saveIns":
              onSaveInstrument();
              return;
            case "loadIns":
              instrumentInputRef.current?.click();
              return;
            case "saveSnc":
              onSaveSnc();
              return;
            case "loadSnc":
              sncInputRef.current?.click();
              return;
            case "popcorn":
              void onPlayPopcorn();
              return;
            default:
              return;
          }
        }}
        className="piano-toolbar-mfc"
        buttonClassName="toolbar-icon-btn"
        renderItem={(entry) => (
          <>
            {entry.text ? (
              <span aria-hidden>{entry.text}</span>
            ) : (
              <span
                className="toolbar-sprite piano-toolbar-sprite"
                style={{ "--sprite-index": entry.spriteIndex } as CSSProperties}
                aria-hidden
              />
            )}
            <span className="sr-only">{entry.label}</span>
          </>
        )}
      />

      <input
        ref={instrumentInputRef}
        type="file"
        accept=".json,.ins,.txt,.wav"
        className="hidden-input"
        onChange={handleInstrumentChange}
      />
      <input ref={sncInputRef} type="file" accept=".snc,.txt" className="hidden-input" onChange={handleSncChange} />
    </div>
  );
}
