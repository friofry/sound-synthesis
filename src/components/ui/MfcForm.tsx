import type { ReactNode } from "react";
import "./MfcDialog.css";
import "./MfcForm.css";

export type MfcFormProps = {
  /** Blue title strip (optional). */
  title?: string;
  children: ReactNode;
  /** Primary action row (buttons), typically right-aligned in dialogs; here flex-start for tool flows. */
  footer?: ReactNode;
  className?: string;
};

/**
 * Embedded WinXP-style form panel: raised border, optional gradient titlebar, body + footer slots.
 * Use with {@link MfcField}, {@link MfcButton}, etc. from the same module.
 */
export function MfcForm({ title, children, footer, className = "" }: MfcFormProps) {
  return (
    <section className={`mfc-form ${className}`.trim()}>
      {title ? <header className="mfc-form-titlebar">{title}</header> : null}
      <div className="mfc-form-body">{children}</div>
      {footer ? <footer className="mfc-form-footer">{footer}</footer> : null}
    </section>
  );
}

export { MfcButton, MfcField, MfcGroupBox, MfcSelect } from "./MfcDialog";
