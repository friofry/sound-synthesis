import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import "./MfcDialog.css";

type MfcDialogProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  width?: number;
  children: ReactNode;
  actions?: ReactNode;
};

type MfcGroupBoxProps = {
  legend: string;
  children: ReactNode;
};

type MfcFieldProps = {
  label: string;
  children: ReactNode;
  labelWidth?: number;
};

type MfcCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
};

type MfcRadioOption<T extends string> = {
  value: T;
  label: string;
};

type MfcRadioGroupProps<T extends string> = {
  name: string;
  value: T;
  options: MfcRadioOption<T>[];
  onChange: (value: T) => void;
  direction?: "row" | "column";
  pushLike?: boolean;
};

type MfcButtonProps = {
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  children: ReactNode;
  variant?: "normal" | "danger";
  defaultAction?: boolean;
  className?: string;
};

export function MfcDialog({ title, open, onClose, onSubmit, width = 360, children, actions }: MfcDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const content = (
    <>
      <div className="mfc-body">{children}</div>
      {actions ? <div className="mfc-actions">{actions}</div> : null}
    </>
  );

  return (
    <div className="mfc-overlay" onClick={onClose}>
      <div className="mfc-window" style={{ width }} onClick={(event) => event.stopPropagation()}>
        <div className="mfc-titlebar">
          <span className="mfc-title">{title}</span>
          <button type="button" className="mfc-title-close" onClick={onClose} aria-label="Close dialog">
            x
          </button>
        </div>
        {onSubmit ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

type MfcNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onChange: (value: number) => void;
};

export function MfcNumberInput({ value, onChange, ...rest }: MfcNumberInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [raw, setRaw] = useState(() => (Number.isFinite(value) ? String(value) : ""));
  const displayValue = isEditing ? raw : Number.isFinite(value) ? String(value) : "";

  return (
    <input
      type="number"
      {...rest}
      value={displayValue}
      onFocus={() => {
        setIsEditing(true);
        setRaw(Number.isFinite(value) ? String(value) : "");
      }}
      onBlur={() => setIsEditing(false)}
      onChange={(event) => {
        const nextRaw = event.target.value;
        setRaw(nextRaw);
        if (nextRaw === "") {
          return;
        }
        const nextValue = Number(nextRaw);
        if (Number.isFinite(nextValue)) {
          onChange(nextValue);
        }
      }}
    />
  );
}

export function MfcGroupBox({ legend, children }: MfcGroupBoxProps) {
  return (
    <fieldset className="mfc-groupbox">
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

export function MfcField({ label, children, labelWidth = 120 }: MfcFieldProps) {
  return (
    <label className="mfc-field">
      <span className="mfc-field-label" style={{ width: labelWidth }}>
        {label}
      </span>
      <span className="mfc-field-control">{children}</span>
    </label>
  );
}

export function MfcCheckbox({ checked, onChange, children }: MfcCheckboxProps) {
  return (
    <label className="mfc-checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function MfcRadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  direction = "column",
  pushLike = false,
}: MfcRadioGroupProps<T>) {
  return (
    <div className={`mfc-radio-group ${direction === "row" ? "row" : "column"} ${pushLike ? "push-like" : ""}`}>
      {options.map((option) => (
        <label key={option.value} className="mfc-radio-option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function MfcButton({
  type = "button",
  onClick,
  children,
  variant = "normal",
  defaultAction = false,
  className = "",
}: MfcButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`mfc-button ${variant === "danger" ? "danger" : ""} ${defaultAction ? "default" : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
