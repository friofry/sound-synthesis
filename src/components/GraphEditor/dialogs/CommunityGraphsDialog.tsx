import { useCallback, useEffect, useState } from "react";
import { MfcButton, MfcDialog } from "../../ui/MfcDialog";
import { MfcListView } from "../../ui/MfcListView";
import "./CommunityGraphsDialog.css";

type CommunityGraphsManifest = {
  graphs: string[];
};

type CommunityGraphsDialogProps = {
  open: boolean;
  onClose: () => void;
  onOpenGraph: (graphPath: string) => Promise<void>;
};

export function CommunityGraphsDialog({ open, onClose, onOpenGraph }: CommunityGraphsDialogProps) {
  const [graphs, setGraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openingGraphPath, setOpeningGraphPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadManifest = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch("/graphs/index.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const manifest = (await response.json()) as CommunityGraphsManifest;
        const nextGraphs = Array.isArray(manifest.graphs) ? manifest.graphs.filter((entry) => typeof entry === "string") : [];
        if (!cancelled) {
          setGraphs(nextGraphs);
        }
      } catch (error) {
        if (!cancelled) {
          setGraphs([]);
          setErrorMessage(`Failed to load community graphs list: ${(error as Error).message}`);
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

  const handleOpenGraph = useCallback(async (graphPath: string) => {
    setOpeningGraphPath(graphPath);
    setErrorMessage(null);
    try {
      await onOpenGraph(graphPath);
      onClose();
    } catch (error) {
      setErrorMessage(`Failed to open graph: ${(error as Error).message}`);
    } finally {
      setOpeningGraphPath(null);
    }
  }, [onClose, onOpenGraph]);

  return (
    <MfcDialog
      title="Browse community graphs"
      open={open}
      onClose={onClose}
      width={560}
      actions={(
        <MfcButton onClick={onClose}>
          Close
        </MfcButton>
      )}
    >
      <div className="community-graphs-dialog">
        <p className="community-graphs-hint">
          Select a graph file from `/graphs` and load it into the editor.
        </p>
        {loading ? <p className="community-graphs-status">Loading list...</p> : null}
        {errorMessage ? <p className="community-graphs-error">{errorMessage}</p> : null}
        <MfcListView
          className="community-graphs-list"
          items={graphs.map((graphPath) => ({
            id: graphPath,
            label: openingGraphPath === graphPath ? "Opening..." : graphPath,
            disabled: openingGraphPath !== null,
          }))}
          emptyMessage={loading ? "Loading list..." : "No graph files found."}
          onSelect={(graphPath) => {
            void handleOpenGraph(graphPath);
          }}
        />
      </div>
    </MfcDialog>
  );
}
