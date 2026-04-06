import { Children, type CSSProperties, type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./MfcSplitView.css";

type MfcSplitViewProps = {
  orientation?: "horizontal" | "vertical";
  defaultRatios?: number[];
  defaultRatio?: number;
  minPaneSize?: number;
  splitterSize?: number;
  children: ReactNode;
  className?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRatios(values: number[]): number[] {
  const sanitized = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const sum = sanitized.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return values.map(() => 1 / Math.max(1, values.length));
  }
  return sanitized.map((value) => value / sum);
}

function createInitialRatios(count: number, defaultRatio?: number, defaultRatios?: number[]): number[] {
  if (count <= 0) {
    return [];
  }

  if (defaultRatios && defaultRatios.length === count) {
    return normalizeRatios(defaultRatios);
  }

  if (count === 2 && defaultRatio !== undefined) {
    const clamped = clamp(defaultRatio, 0.05, 0.95);
    return [clamped, 1 - clamped];
  }

  return Array.from({ length: count }, () => 1 / count);
}

function resolveRatios(
  currentRatios: number[],
  paneCount: number,
  defaultRatio?: number,
  defaultRatios?: number[],
): number[] {
  if (currentRatios.length === paneCount && currentRatios.length > 0) {
    return normalizeRatios(currentRatios);
  }
  return createInitialRatios(paneCount, defaultRatio, defaultRatios);
}

function computePaneSizes(availableSize: number, ratios: number[]): number[] {
  if (availableSize <= 0 || ratios.length === 0) {
    return ratios.map(() => 0);
  }

  const normalized = normalizeRatios(ratios);
  const rawSizes = normalized.map((ratio) => ratio * availableSize);
  const baseSizes = rawSizes.map((size) => Math.floor(size));
  const remainder = availableSize - baseSizes.reduce((sum, size) => sum + size, 0);

  const fractions = rawSizes.map((raw, i) => ({ index: i, frac: raw - baseSizes[i] }));
  fractions.sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < remainder; i += 1) {
    baseSizes[fractions[i].index] += 1;
  }

  return baseSizes;
}

export function MfcSplitView({
  orientation = "horizontal",
  defaultRatios,
  defaultRatio = 0.5,
  minPaneSize = 50,
  splitterSize = 6,
  children,
  className = "",
}: MfcSplitViewProps) {
  const childrenArray = useMemo(() => Children.toArray(children), [children]);
  const paneCount = childrenArray.length;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ratios, setRatios] = useState(() => createInitialRatios(paneCount, defaultRatio, defaultRatios));
  const [mainSize, setMainSize] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const activeSplitterRef = useRef<number | null>(null);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const updateMainSize = () => {
      const rect = node.getBoundingClientRect();
      const nextSize = orientation === "horizontal" ? rect.width : rect.height;
      setMainSize(Math.max(0, Math.floor(nextSize)));
    };

    updateMainSize();
    const observer = new ResizeObserver(updateMainSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, [orientation]);

  const setRatioFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const node = hostRef.current;
      if (!node) return;
      if (activeSplitterRef.current === null) return;

      const rect = node.getBoundingClientRect();
      const containerSize = orientation === "horizontal" ? rect.width : rect.height;
      const totalSplitterSpace = splitterSize * Math.max(0, paneCount - 1);
      const availableSize = containerSize - totalSplitterSpace;
      if (availableSize <= 0) return;
      if (paneCount < 2) return;

      const splitterIndex = activeSplitterRef.current;

      setRatios((prevRatios) => {
        const effectiveRatios = resolveRatios(prevRatios, paneCount, defaultRatio, defaultRatios);
        const prevSizes = computePaneSizes(availableSize, effectiveRatios);
        const pairSize = prevSizes[splitterIndex] + prevSizes[splitterIndex + 1];
        const effectiveMinPaneSize = Math.min(minPaneSize, pairSize / 2);

        const pointerCoord = orientation === "horizontal" ? clientX - rect.left : clientY - rect.top;
        const paneStart =
          prevSizes.slice(0, splitterIndex).reduce((sum, size) => sum + size, 0) +
          splitterSize * splitterIndex;
        const splitterCenter = paneStart + prevSizes[splitterIndex] + splitterSize / 2;
        const delta = pointerCoord - splitterCenter;

        const currentPaneI = prevSizes[splitterIndex];
        const newPaneI = clamp(currentPaneI + delta, effectiveMinPaneSize, pairSize - effectiveMinPaneSize);

        const nextSizes = [...prevSizes];
        nextSizes[splitterIndex] = newPaneI;
        nextSizes[splitterIndex + 1] = pairSize - newPaneI;
        return normalizeRatios(nextSizes);
      });
    },
    [defaultRatio, defaultRatios, minPaneSize, orientation, paneCount, splitterSize],
  );

  const onPointerDown = useCallback(
    (splitterIndex: number) => (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      activePointerIdRef.current = event.pointerId;
      activeSplitterRef.current = splitterIndex;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setRatioFromClient(event.clientX, event.clientY);
    },
    [setRatioFromClient],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isDragging || activePointerIdRef.current !== event.pointerId) return;
      setRatioFromClient(event.clientX, event.clientY);
    },
    [isDragging, setRatioFromClient],
  );

  const stopDragging = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerIdRef.current = null;
    activeSplitterRef.current = null;
    setIsDragging(false);
  }, []);

  const availableSize = Math.max(0, mainSize - splitterSize * Math.max(0, paneCount - 1));
  const effectiveRatios = useMemo(
    () => resolveRatios(ratios, paneCount, defaultRatio, defaultRatios),
    [defaultRatio, defaultRatios, paneCount, ratios],
  );
  const paneSizes = useMemo(() => computePaneSizes(availableSize, effectiveRatios), [availableSize, effectiveRatios]);
  const paneStyles = useMemo<CSSProperties[]>(
    () =>
      paneSizes.map((size) => ({
        flex: `0 0 ${size}px`,
      })),
    [paneSizes],
  );
  const splitterStyle: CSSProperties = useMemo(
    () => (orientation === "horizontal" ? { width: `${splitterSize}px` } : { height: `${splitterSize}px` }),
    [orientation, splitterSize],
  );

  const rootClassName = [
    "mfc-split-view",
    orientation === "vertical" ? "is-vertical" : "is-horizontal",
    isDragging ? "is-dragging" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={hostRef} className={rootClassName}>
      {childrenArray.map((child, index) => (
        <div key={`pane-${index}`} className="mfc-split-pane" style={paneStyles[index]}>
          {child}
        </div>
      )).reduce<ReactNode[]>((acc, pane, index) => {
        acc.push(pane);
        if (index < childrenArray.length - 1) {
          acc.push(
            <div
              key={`splitter-${index}`}
              className="mfc-splitter"
              style={splitterStyle}
              role="separator"
              aria-orientation={orientation}
              onPointerDown={onPointerDown(index)}
              onPointerMove={onPointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
            />,
          );
        }
        return acc;
      }, [])}
    </div>
  );
}
