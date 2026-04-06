import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./MfcMenu.css";

export type MfcMenuActionItem = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
};

export type MfcMenuSeparator = {
  kind: "separator";
  id: string;
};

export type MfcMenuItem = MfcMenuActionItem | MfcMenuSeparator;

export type MfcMenuBarItem = {
  id: string;
  label: string;
  items: MfcMenuItem[];
};

type MfcMenuBarProps = {
  items: MfcMenuBarItem[];
  className?: string;
  renderLabel?: (item: MfcMenuBarItem) => ReactNode;
};

export function MfcMenuBar({ items, className = "", renderLabel }: MfcMenuBarProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const hasOpenMenu = activeMenuId !== null;

  useEffect(() => {
    function handleDocumentPointerDown(event: MouseEvent): void {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) {
        return;
      }
      setActiveMenuId(null);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setActiveMenuId(null);
      }
    }

    document.addEventListener("mousedown", handleDocumentPointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const rootClassName = useMemo(() => ["mfc-menu-bar", className].filter(Boolean).join(" "), [className]);

  return (
    <header className={rootClassName} ref={rootRef}>
      <div className="mfc-menu-bar-items" role="menubar" aria-label="Application menu">
        {items.map((menu) => {
          const expanded = activeMenuId === menu.id;
          return (
            <div key={menu.id} className="mfc-menu-root-item">
              <button
                type="button"
                className={`mfc-menu-root-button ${expanded ? "is-open" : ""}`}
                onClick={() => setActiveMenuId((current) => (current === menu.id ? null : menu.id))}
                onMouseEnter={() => {
                  if (hasOpenMenu) {
                    setActiveMenuId(menu.id);
                  }
                }}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={expanded}
              >
                {renderLabel ? renderLabel(menu) : menu.label}
              </button>
              {expanded ? (
                <ul className="mfc-menu-dropdown" role="menu" aria-label={menu.label}>
                  {menu.items.map((item) =>
                    isSeparator(item) ? (
                      <li key={item.id} className="mfc-menu-separator" role="separator" />
                    ) : (
                      <li key={item.id} role="none">
                        <button
                          type="button"
                          className="mfc-menu-item"
                          role="menuitem"
                          disabled={item.disabled}
                          onClick={() => {
                            if (item.disabled) {
                              return;
                            }
                            item.onClick?.();
                            setActiveMenuId(null);
                          }}
                        >
                          <span className="mfc-menu-item-label">{item.label}</span>
                          <span className="mfc-menu-item-shortcut">{item.shortcut ?? ""}</span>
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </header>
  );
}

function isSeparator(item: MfcMenuItem): item is MfcMenuSeparator {
  return "kind" in item && item.kind === "separator";
}
