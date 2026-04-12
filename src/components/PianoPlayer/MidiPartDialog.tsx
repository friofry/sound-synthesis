import { MfcButton, MfcDialog } from "../ui/MfcDialog";
import { MfcListView } from "../ui/MfcListView";
import type { MidiTrackListEntry } from "../../engine/midi/listMidiParts";
import "../GraphEditor/dialogs/CommunityGraphsDialog.css";

type MidiPartDialogProps = {
  open: boolean;
  fileName: string;
  parts: MidiTrackListEntry[];
  onClose: () => void;
  onSelectPart: (trackIndex: number) => void;
};

export function MidiPartDialog({ open, fileName, parts, onClose, onSelectPart }: MidiPartDialogProps) {
  return (
    <MfcDialog
      title="Choose MIDI part"
      open={open}
      onClose={onClose}
      width={520}
      actions={
        <>
          <MfcButton onClick={onClose}>Cancel</MfcButton>
        </>
      }
    >
      <div className="community-graphs-dialog">
        <p className="community-graphs-hint">
          File: <strong>{fileName}</strong>. Select a track to play on the current generated piano.
        </p>
        <MfcListView
          className="community-graphs-list"
          items={parts.map((p) => ({
            id: String(p.trackIndex),
            label: `${p.label} — ${p.noteCount} note${p.noteCount === 1 ? "" : "s"}`,
          }))}
          emptyMessage="No tracks with notes."
          onSelect={(id) => {
            onSelectPart(Number(id));
          }}
        />
      </div>
    </MfcDialog>
  );
}
