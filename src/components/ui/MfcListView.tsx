import type { ReactNode } from "react";
import "./MfcListView.css";

export type MfcListViewItem<TId extends string = string> = {
  id: TId;
  label: string;
  disabled?: boolean;
};

type MfcListViewProps<TId extends string = string> = {
  items: MfcListViewItem<TId>[];
  selectedId?: TId | null;
  onSelect: (id: TId) => void;
  className?: string;
  emptyMessage?: string;
  renderItem?: (item: MfcListViewItem<TId>) => ReactNode;
};

export function MfcListView<TId extends string = string>({
  items,
  selectedId = null,
  onSelect,
  className = "",
  emptyMessage = "No items.",
  renderItem,
}: MfcListViewProps<TId>) {
  const rootClassName = ["mfc-list-view", className].filter(Boolean).join(" ");

  if (items.length === 0) {
    return <div className={rootClassName}>{emptyMessage}</div>;
  }

  return (
    <div className={rootClassName} aria-label="List view">
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        const itemClassName = ["mfc-list-view-item", isSelected ? "is-selected" : ""].filter(Boolean).join(" ");
        return (
          <button
            key={item.id}
            type="button"
            className={itemClassName}
            disabled={item.disabled}
            aria-pressed={isSelected}
            onClick={() => onSelect(item.id)}
          >
            {renderItem ? renderItem(item) : item.label}
          </button>
        );
      })}
    </div>
  );
}
