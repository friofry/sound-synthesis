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
  disabled?: boolean;
  /** Maps to `aria-pressed` for toggle-style actions (e.g. Play/Stop). */
  pressed?: boolean;
};

type MfcSelectOption<T extends string> = {
  value: T;
  label: string;
};

type MfcSelectProps<T extends string> = Omit<InputHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: T;
  options: MfcSelectOption<T>[];
  onChange: (value: T) => void;
};

export function MfcDialog({ title, open, onClose, onSubmit, width = 360, children, actions }: MfcDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (onSubmit) {
        onSubmit();
      } else {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, onSubmit]);

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

export function MfcNumberInput({ value, onChange, step, min, ...rest }: MfcNumberInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const normalizedValue = normalizeNumberInputValue(value, step, min);
  const formattedValue = formatNumberInputValue(value, step, min);
  const [raw, setRaw] = useState(() => formattedValue);
  const displayValue = isEditing ? raw : formattedValue;

  useEffect(() => {
    if (isEditing || !Number.isFinite(value)) {
      return;
    }
    if (!numbersMatchForInput(value, normalizedValue, step)) {
      onChange(normalizedValue);
    }
  }, [isEditing, normalizedValue, onChange, step, value]);

  return (
    <input
      type="number"
      {...rest}
      step={step}
      min={min}
      value={displayValue}
      onFocus={() => {
        setIsEditing(true);
        setRaw(formattedValue);
      }}
      onBlur={() => {
        setIsEditing(false);
        if (raw === "") {
          return;
        }
        const nextValue = Number(raw);
        if (!Number.isFinite(nextValue)) {
          return;
        }
        const nextNormalizedValue = normalizeNumberInputValue(nextValue, step, min);
        if (!numbersMatchForInput(nextValue, nextNormalizedValue, step)) {
          onChange(nextNormalizedValue);
        }
      }}
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

function formatNumberInputValue(
  value: number,
  step: InputHTMLAttributes<HTMLInputElement>["step"],
  min: InputHTMLAttributes<HTMLInputElement>["min"],
): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const stepValue = parseInputStep(step);
  if (stepValue === null) {
    return String(value);
  }
  const precision = getInputStepPrecision(step);
  return trimTrailingZeroes(normalizeNumberInputValue(value, step, min).toFixed(precision));
}

function normalizeNumberInputValue(
  value: number,
  step: InputHTMLAttributes<HTMLInputElement>["step"],
  min: InputHTMLAttributes<HTMLInputElement>["min"],
): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const stepValue = parseInputStep(step);
  if (stepValue === null) {
    return value;
  }
  const base = parseNumericInputValue(min) ?? 0;
  const precision = getInputStepPrecision(step);
  const normalized = base + Math.round((value - base) / stepValue) * stepValue;
  return Number(normalized.toFixed(precision));
}

function numbersMatchForInput(
  left: number,
  right: number,
  step: InputHTMLAttributes<HTMLInputElement>["step"],
): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  const stepValue = parseInputStep(step);
  const tolerance = stepValue === null ? 1e-12 : Math.max(1e-12, stepValue / 1_000_000);
  return Math.abs(left - right) <= tolerance;
}

function parseInputStep(step: InputHTMLAttributes<HTMLInputElement>["step"]): number | null {
  if (step === undefined || step === "" || step === "any") {
    return null;
  }
  const parsed = typeof step === "number" ? step : Number(step);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNumericInputValue(value: InputHTMLAttributes<HTMLInputElement>["min"]): number | null {
  if (value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getInputStepPrecision(step: InputHTMLAttributes<HTMLInputElement>["step"]): number {
  if (step === undefined || step === "" || step === "any") {
    return 0;
  }
  const text = String(step).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const decimalPartLength = coefficient.includes(".") ? coefficient.length - coefficient.indexOf(".") - 1 : 0;
  return Math.max(0, decimalPartLength - exponent);
}

function trimTrailingZeroes(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
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
  disabled = false,
  pressed,
}: MfcButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={`mfc-button ${variant === "danger" ? "danger" : ""} ${defaultAction ? "default" : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export function MfcSelect<T extends string>({ value, options, onChange, ...rest }: MfcSelectProps<T>) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
