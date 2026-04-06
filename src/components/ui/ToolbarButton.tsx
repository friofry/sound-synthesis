import type { CSSProperties } from "react";

type ToolbarButtonProps = {
  label: string;
  title?: string;
  spriteIndex: number;
  spriteClassName: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
};

export function ToolbarButton({
  label,
  title,
  spriteIndex,
  spriteClassName,
  onClick,
  disabled = false,
  selected = false,
  className = "toolbar-btn toolbar-icon-btn",
}: ToolbarButtonProps) {
  const buttonClassName = [className, selected ? "is-selected" : ""].filter(Boolean).join(" ");
  const iconClassName = ["toolbar-sprite", spriteClassName].join(" ");

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      aria-pressed={selected || undefined}
      disabled={disabled}
    >
      <span className="mfc-toolbar-button-content">
        <span className={iconClassName} style={{ "--sprite-index": spriteIndex } as CSSProperties} aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    </button>
  );
}
