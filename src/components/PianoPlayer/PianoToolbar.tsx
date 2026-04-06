import { useRef, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
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
};

type PianoActionId = "none" | "one" | "generate" | "record" | "stop" | "saveIns" | "loadIns" | "saveSnc" | "loadSnc";

type PianoToolbarButton = MfcToolbarItem<PianoActionId> & {
  spriteIndex: number;
  icon?: ReactNode;
  disabled?: boolean;
  action: () => void;
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
      action: onGenerateOne,
    },
    {
      id: "generate",
      label: "Generate instrument",
      title: "Generate instrument",
      spriteIndex: 1,
      action: onGenerateInstrument,
    },
    { kind: "separator", id: "sep-1" },
    {
      id: "record",
      label: "Record",
      title: "Record",
      spriteIndex: -1,
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="8" fill="#cc0000" /></svg>,
      disabled: recording,
      action: onToggleRecording,
    },
    {
      id: "stop",
      label: "Stop",
      title: "Stop",
      spriteIndex: -1,
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="5" y="5" width="14" height="14" fill="#000" /></svg>,
      disabled: !recording,
      action: onToggleRecording,
    },
    { kind: "separator", id: "sep-2" },
    {
      id: "saveIns",
      label: "Save instrument",
      title: "Save instrument",
      spriteIndex: 4,
      action: onSaveInstrument,
    },
    {
      id: "loadIns",
      label: "Load instrument",
      title: "Load instrument",
      spriteIndex: 5,
      action: () => instrumentInputRef.current?.click(),
    },
    { kind: "separator", id: "sep-3" },
    {
      id: "saveSnc",
      label: "Save melody to file",
      title: "Save melody to file",
      spriteIndex: 6,
      action: onSaveSnc,
    },
    {
      id: "loadSnc",
      label: "Play melody from file (SNC, WAV)",
      title: "Play melody from file (SNC, WAV)",
      spriteIndex: 7,
      action: () => sncInputRef.current?.click(),
    },
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
          const item = items.find((entry): entry is PianoToolbarButton => !("kind" in entry) && entry.id === id);
          item?.action();
        }}
        className="piano-toolbar-mfc"
        buttonClassName="toolbar-icon-btn"
        renderItem={(entry) => (
          <>
            {entry.icon ?? (
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
