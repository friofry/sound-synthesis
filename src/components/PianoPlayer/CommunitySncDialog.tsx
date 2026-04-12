import { useCallback, useEffect, useState } from "react";
import { MfcButton, MfcDialog } from "../ui/MfcDialog";
import { MfcListView } from "../ui/MfcListView";
import "../GraphEditor/dialogs/CommunityGraphsDialog.css";

type CommunitySncManifest = {
  snc: string[];
};

type CommunitySncDialogProps = {
  open: boolean;
  onClose: () => void;
  onOpenSnc: (sncPath: string) => Promise<void>;
};

export function CommunitySncDialog({ open, onClose, onOpenSnc }: CommunitySncDialogProps) {
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
        const response = await fetch("/snc/index.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const manifest = (await response.json()) as CommunitySncManifest;
        const next = Array.isArray(manifest.snc) ? manifest.snc.filter((entry) => typeof entry === "string") : [];
        if (!cancelled) {
          setFiles(next);
        }
      } catch (error) {
        if (!cancelled) {
          setFiles([]);
          setErrorMessage(`Failed to load community SNC list: ${(error as Error).message}`);
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
    async (sncPath: string) => {
      setOpeningPath(sncPath);
      setErrorMessage(null);
      try {
        await onOpenSnc(sncPath);
        onClose();
      } catch (error) {
        setErrorMessage(`Failed to open SNC: ${(error as Error).message}`);
      } finally {
        setOpeningPath(null);
      }
    },
    [onClose, onOpenSnc],
  );

  return (
    <MfcDialog
      title="Browse community SNC"
      open={open}
      onClose={onClose}
      width={560}
      actions={<MfcButton onClick={onClose}>Close</MfcButton>}
    >
      <div className="community-graphs-dialog">
        <p className="community-graphs-hint">Select a melody file from `/snc` and play it with the current instrument.</p>
        {loading ? <p className="community-graphs-status">Loading list...</p> : null}
        {errorMessage ? <p className="community-graphs-error">{errorMessage}</p> : null}
        <MfcListView
          className="community-graphs-list"
          items={files.map((path) => ({
            id: path,
            label: openingPath === path ? "Opening..." : path,
            disabled: openingPath !== null,
          }))}
          emptyMessage={loading ? "Loading list..." : "No SNC files found."}
          onSelect={(path) => {
            void handleOpen(path);
          }}
        />
      </div>
    </MfcDialog>
  );
}
