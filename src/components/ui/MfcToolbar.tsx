import type { ReactNode } from "react";
import "./MfcToolbar.css";

export type MfcToolbarItem<T extends string = string> = {
  id: T;
  label: string;
  title?: string;
  disabled?: boolean;
  /** When set, controls the pressed (selected) look independently of selectedId — for multi-toggle toolbars */
  pressed?: boolean;
};

export type MfcToolbarSeparator = {
  kind: "separator";
  id: string;
};

type MfcToolbarElement<TItem extends MfcToolbarItem<string>> = TItem | MfcToolbarSeparator;

type MfcToolbarProps<TItem extends MfcToolbarItem<string>> = {
  items: MfcToolbarElement<TItem>[];
  selectedId: TItem["id"];
  onSelect: (id: TItem["id"]) => void;
  renderItem?: (item: TItem) => ReactNode;
  orientation?: "horizontal" | "vertical";
  className?: string;
  buttonClassName?: string;
  /** Set false when this bar sits inside an outer element with role="toolbar" */
  hasToolbarRole?: boolean;
};

export function MfcToolbar<TItem extends MfcToolbarItem<string>>({
  items,
  selectedId,
  onSelect,
  renderItem,
  orientation = "horizontal",
  className = "",
  buttonClassName = "",
  hasToolbarRole = true,
}: MfcToolbarProps<TItem>) {
  const rootClassName = ["mfc-toolbar", orientation === "vertical" ? "vertical" : "", className].filter(Boolean).join(" ");

  return (
    <div
      className={rootClassName}
      role={hasToolbarRole ? "toolbar" : undefined}
      aria-orientation={hasToolbarRole ? orientation : undefined}
    >
      {items.map((item) => {
        if (isSeparator(item)) {
          return <div key={item.id} className="mfc-toolbar-separator" role="separator" aria-orientation={orientation} />;
        }
        const isSelected =
          item.pressed !== undefined ? item.pressed : item.id === selectedId;
        const itemClassName = ["mfc-toolbar-button", isSelected ? "is-selected" : "", buttonClassName].filter(Boolean).join(" ");
        return (
          <button
            key={item.id}
            type="button"
            className={itemClassName}
            onClick={() => onSelect(item.id)}
            title={item.title ?? item.label}
            disabled={item.disabled}
            aria-pressed={isSelected}
            aria-label={item.label}
          >
            <span className="mfc-toolbar-button-content">{renderItem ? renderItem(item) : item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function isSeparator<TItem extends MfcToolbarItem<string>>(item: MfcToolbarElement<TItem>): item is MfcToolbarSeparator {
  return "kind" in item && item.kind === "separator";
}
