import { MfcDialog } from "../ui/MfcDialog";

type GenerationProgressDialogProps = {
  open: boolean;
  progress: number;
  label: string;
};

export function GenerationProgressDialog({ open, progress, label }: GenerationProgressDialogProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <MfcDialog title="Generating instrument..." open={open} onClose={() => {}} width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>{label || "Please wait..."}</div>
        <div
          style={{
            width: "100%",
            height: 18,
            background: "#fff",
            border: "1px solid #7f7f7f",
            boxShadow: "inset 1px 1px 0 #404040, inset -1px -1px 0 #fff",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${safeProgress}%`,
              height: "100%",
              background: "linear-gradient(90deg, #0a246a 0%, #3a6ea5 100%)",
            }}
          />
        </div>
        <div>{safeProgress}%</div>
      </div>
    </MfcDialog>
  );
}
