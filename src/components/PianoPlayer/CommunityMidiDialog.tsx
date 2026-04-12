import { useCallback, useEffect, useState } from "react";
import { MfcButton, MfcDialog } from "../ui/MfcDialog";
import { MfcListView } from "../ui/MfcListView";
import "../GraphEditor/dialogs/CommunityGraphsDialog.css";

type CommunityMidiManifest = {
  midi: string[];
};

type CommunityMidiDialogProps = {
  open: boolean;
  onClose: () => void;
  onOpenMidi: (midiPath: string) => Promise<void>;
};

export function CommunityMidiDialog({ open, onClose, onOpenMidi }: CommunityMidiDialogProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadManifest = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch("/midi/index.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const manifest = (await response.json()) as CommunityMidiManifest;
        const next = Array.isArray(manifest.midi) ? manifest.midi.filter((entry) => typeof entry === "string") : [];
        if (!cancelled) {
          setFiles(next);
        }
      } catch (error) {
        if (!cancelled) {
          setFiles([]);
          setErrorMessage(`Failed to load community MIDI list: ${(error as Error).message}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadManifest();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleOpen = useCallback(
    async (midiPath: string) => {
      setOpeningPath(midiPath);
      setErrorMessage(null);
      try {
        await onOpenMidi(midiPath);
        onClose();
      } catch (error) {
        setErrorMessage(`Failed to open MIDI: ${(error as Error).message}`);
      } finally {
        setOpeningPath(null);
      }
    },
    [onClose, onOpenMidi],
  );

  return (
    <MfcDialog
      title="Browse community MIDI"
      open={open}
      onClose={onClose}
      width={560}
      actions={<MfcButton onClick={onClose}>Close</MfcButton>}
    >
      <div className="community-graphs-dialog">
        <p className="community-graphs-hint">Select a MIDI file from `/midi` and play it with the current instrument.</p>
        {loading ? <p className="community-graphs-status">Loading list...</p> : null}
        {errorMessage ? <p className="community-graphs-error">{errorMessage}</p> : null}
        <MfcListView
          className="community-graphs-list"
          items={files.map((path) => ({
            id: path,
            label: openingPath === path ? "Opening..." : path,
            disabled: openingPath !== null,
          }))}
          emptyMessage={loading ? "Loading list..." : "No MIDI files found."}
          onSelect={(path) => {
            void handleOpen(path);
          }}
        />
      </div>
    </MfcDialog>
  );
}
