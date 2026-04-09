import { useEffect, useMemo, useRef, useState } from "react";
import { DOT_RADIUS, GRAPH_COLORS, IGNORE_RADIUS } from "../../engine/types";
import { useGraphStore, type Rect } from "../../store/graphStore";
import { generateHammerOneShot } from "./hammerOneShot";

const MIN_GROUP_SIZE = 8;
const LINE_HIT_THRESHOLD = 10;
const HAMMER_CHARGE_MS = 1200;
const HAMMER_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27 viewBox=%270 0 24 24%27%3E%3Ctext x=%271%27 y=%2718%27 font-size=%2718%27%3E%F0%9F%94%A8%3C/text%3E%3C/svg%3E") 4 20, crosshair';

type GraphCanvasProps = {
  onHammerPreview?: (buffer: Float32Array, sampleRate: number) => void;
  onHammerImpact?: (payload: {
    impactX: number;
    impactY: number;
    charge: number;
    settings: {
      distribution: "equivalent" | "smoothed";
      weight: number;
      velocity: number;
      restitution: number;
      radius: number;
    };
  }) => void;
};

export function GraphCanvas({ onHammerPreview, onHammerImpact }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 700 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [groupMoveBase, setGroupMoveBase] = useState<Rect | null>(null);
  const [groupMoveSnapshot, setGroupMoveSnapshot] = useState<Array<{ x: number; y: number }> | null>(null);
  const hammerPressStartRef = useRef<number | null>(null);

  const {
    graph,
    tool,
    selectedDotA,
    selectedDotB,
    selectedLineIndex,
    hoveredDot,
    hoveredLineIndex,
    playingPoint,
    dragDotIndex,
    pendingGroupRect,
    dragGroupRect,
    hammerSettings,
    hammerPreviewPoint,
    hammerCharge,
    defaultWeight,
    defaultStiffness,
    viewportScale,
    viewportOffset,
    setCanvasSize,
    zoomViewport,
    panViewport,
    setCursor,
    setHoveredDot,
    setHoveredLine,
    setSelectedDots,
    setSelectedLineIndex,
    setPlayingPoint,
    setDragDotIndex,
    setPendingGroupRect,
    setDragGroupRect,
    setHammerPreviewPoint,
    setHammerCharge,
    updateGraph,
    openDotDialog,
    openLineDialog,
    openGroupDialog,
    setTool,
  } = useGraphStore();

  useEffect(() => {
    if (tool !== "hammer") {
      hammerPressStartRef.current = null;
      setHammerPreviewPoint(null);
      setHammerCharge(0);
    }
  }, [setHammerCharge, setHammerPreviewPoint, tool]);

  useEffect(() => {
    if (tool !== "hammer") {
      return;
    }
    const timer = window.setInterval(() => {
      if (hammerPressStartRef.current === null) {
        return;
      }
      const charge = clamp((performance.now() - hammerPressStartRef.current) / HAMMER_CHARGE_MS, 0, 1);
      setHammerCharge(charge);
    }, 50);
    return () => window.clearInterval(timer);
  }, [setHammerCharge, tool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(200, Math.floor(entry.contentRect.width));
      const height = Math.max(200, Math.floor(entry.contentRect.height));
      setSize({ width, height });
      setCanvasSize(width, height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [setCanvasSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.fillStyle = GRAPH_COLORS.canvas;
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.save();
    ctx.setTransform(viewportScale, 0, 0, viewportScale, viewportOffset.x, viewportOffset.y);
    ctx.lineWidth = 1 / viewportScale;
    for (let i = 0; i < graph.lines.length; i += 1) {
      const line = graph.lines[i];
      const d1 = graph.dots[line.dot1];
      const d2 = graph.dots[line.dot2];
      if (!d1 || !d2) {
        continue;
      }
      ctx.strokeStyle = i === selectedLineIndex || i === hoveredLineIndex ? GRAPH_COLORS.highlight : GRAPH_COLORS.line;
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.stroke();
    }

    for (let i = 0; i < graph.dots.length; i += 1) {
      const dot = graph.dots[i];
      const selected = i === selectedDotA || i === selectedDotB || i === hoveredDot;
      let fill: string = dot.fixed ? GRAPH_COLORS.dotFixed : GRAPH_COLORS.dotFree;
      if (selected) {
        fill = GRAPH_COLORS.highlight;
      }
      if (playingPoint === i) {
        fill = GRAPH_COLORS.playing;
      }

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, DOT_RADIUS / viewportScale, 0, Math.PI * 2);
      ctx.fill();
    }

    if (pendingGroupRect) {
      drawRect(ctx, pendingGroupRect, GRAPH_COLORS.highlight, viewportScale);
    }
    if (dragGroupRect) {
      drawRect(ctx, dragGroupRect, GRAPH_COLORS.playing, viewportScale);
    }
    if (tool === "hammer" && hammerPreviewPoint) {
      const liveCharge =
        hammerPressStartRef.current === null
          ? hammerCharge
          : clamp((performance.now() - hammerPressStartRef.current) / HAMMER_CHARGE_MS, 0, 1);
      drawHammerPreview(ctx, hammerPreviewPoint, Math.max(1, hammerSettings.radius), liveCharge, viewportScale);
    }
    ctx.restore();
  }, [
    dragGroupRect,
    graph,
    hammerCharge,
    hammerPreviewPoint,
    hammerSettings.radius,
    hoveredDot,
    hoveredLineIndex,
    pendingGroupRect,
    playingPoint,
    selectedDotA,
    selectedDotB,
    selectedLineIndex,
    size.height,
    size.width,
    tool,
    viewportOffset.x,
    viewportOffset.y,
    viewportScale,
  ]);

  const cursorMap = useMemo(
    () =>
      ({
        "add-point-link": "crosshair",
        "delete-point": "not-allowed",
        "delete-link": "pointer",
        select: "default",
        "drag-point": dragDotIndex !== null ? "grabbing" : "grab",
        "drag-viewport": dragStart ? "grabbing" : "grab",
        "move-group": "move",
        "playing-point": "cell",
        hammer: HAMMER_CURSOR,
        "modify-point": "context-menu",
        "modify-link": "context-menu",
        "modify-group": "crosshair",
        "merge-groups": "pointer",
        "zoom-in": "zoom-in",
        "zoom-out": "zoom-out",
      }) as Record<string, string>,
    [dragDotIndex, dragStart],
  );

  function getScreenPoint(event: React.MouseEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): {
    x: number;
    y: number;
  } {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function screenToWorld(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: Math.round((point.x - viewportOffset.x) / viewportScale),
      y: Math.round((point.y - viewportOffset.y) / viewportScale),
    };
  }

  function handleMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void {
    const screenPoint = getScreenPoint(event);
    const point = screenToWorld(screenPoint);
    setCursor(point.x, point.y);

    const dot = graph.getDotIndexByCoords(point.x, point.y, IGNORE_RADIUS / viewportScale);
    setHoveredDot(dot >= 0 ? dot : null);

    const lineIndex = graph.getLineIndexNearPoint(point.x, point.y, LINE_HIT_THRESHOLD / viewportScale);
    setHoveredLine(lineIndex >= 0 ? lineIndex : null);

    if (tool === "hammer") {
      setHammerPreviewPoint(point);
      if (hammerPressStartRef.current !== null) {
        setHammerCharge(clamp((performance.now() - hammerPressStartRef.current) / HAMMER_CHARGE_MS, 0, 1));
      }
    }

    if (dragDotIndex !== null && (tool === "drag-point" || tool === "select")) {
      updateGraph((next) => next.moveDot(dragDotIndex, point.x, point.y));
      return;
    }

    if (tool === "drag-point" && dragStart && dragDotIndex === null) {
      setPendingGroupRect({ x1: dragStart.x, y1: dragStart.y, x2: point.x, y2: point.y });
      return;
    }

    if (tool === "drag-viewport" && dragStart) {
      const dx = screenPoint.x - dragStart.x;
      const dy = screenPoint.y - dragStart.y;
      panViewport(dx, dy);
      setDragStart(screenPoint);
      return;
    }

    if (tool === "modify-group" && dragStart) {
      setPendingGroupRect({ x1: dragStart.x, y1: dragStart.y, x2: point.x, y2: point.y });
      return;
    }

    if (tool === "move-group" && dragStart && groupMoveBase && groupMoveSnapshot) {
      const dx = point.x - dragStart.x;
      const dy = point.y - dragStart.y;
      updateGraph((next) => {
        next.dots.forEach((dotValue, idx) => {
          if (!isPointInRect(dotValue.x, dotValue.y, groupMoveBase)) {
            return;
          }
          const source = groupMoveSnapshot[idx];
          next.moveDot(idx, source.x + dx, source.y + dy);
        });
      });
      setDragGroupRect({
        x1: groupMoveBase.x1 + dx,
        y1: groupMoveBase.y1 + dy,
        x2: groupMoveBase.x2 + dx,
        y2: groupMoveBase.y2 + dy,
      });
    }
  }

  function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) {
      return;
    }

    const screenPoint = getScreenPoint(event);
    const point = screenToWorld(screenPoint);
    const dot = graph.getDotIndexByCoords(point.x, point.y, IGNORE_RADIUS / viewportScale);
    const lineIndex = graph.getLineIndexNearPoint(point.x, point.y, LINE_HIT_THRESHOLD / viewportScale);

    if (tool === "delete-point" && dot >= 0) {
      updateGraph((next) => next.delDot(dot));
      if (playingPoint === dot) {
        setPlayingPoint(null);
      }
      return;
    }

    if (tool === "playing-point" && dot >= 0 && !graph.dots[dot].fixed) {
      setPlayingPoint(dot);
      return;
    }

    if (tool === "modify-point" && dot >= 0) {
      openDotDialog(dot);
      return;
    }

    if (tool === "modify-link") {
      if (lineIndex >= 0) {
        openLineDialog(lineIndex);
      } else if (selectedDotA !== null && selectedDotB !== null) {
        const pairLine = graph.lines.findIndex(
          (line) =>
            (line.dot1 === selectedDotA && line.dot2 === selectedDotB) ||
            (line.dot1 === selectedDotB && line.dot2 === selectedDotA),
        );
        if (pairLine >= 0) {
          openLineDialog(pairLine);
        }
      }
      return;
    }

    if (tool === "drag-point") {
      if (dot >= 0) {
        setDragDotIndex(dot);
      } else {
        setDragStart(point);
        setPendingGroupRect({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
      }
      return;
    }

    if (tool === "drag-viewport") {
      setDragStart(screenPoint);
      return;
    }

    if (tool === "modify-group") {
      setDragStart(point);
      setPendingGroupRect({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
      return;
    }

    if (tool === "move-group") {
      const activeRect = dragGroupRect ?? pendingGroupRect;
      if (activeRect && isPointInRect(point.x, point.y, activeRect)) {
        setDragStart(point);
        setGroupMoveBase(activeRect);
        setGroupMoveSnapshot(graph.dots.map((d) => ({ x: d.x, y: d.y })));
      } else {
        setTool("modify-group");
        setDragStart(point);
        setPendingGroupRect({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
      }
      return;
    }

    if (tool === "hammer") {
      setHammerPreviewPoint(point);
      hammerPressStartRef.current = performance.now();
      setHammerCharge(0);
      return;
    }

    if (tool === "add-point-link") {
      if (dot >= 0) {
        if (selectedDotA === null) {
          setSelectedDots(dot, null);
          setSelectedLineIndex(null);
        } else if (selectedDotA !== dot) {
          updateGraph((next) => next.addLine(selectedDotA, dot, defaultStiffness));
          setSelectedDots(dot, null);
          setSelectedLineIndex(null);
        }
        return;
      }

      let nextSelectedDot: number | null = null;
      updateGraph((next) => {
        const newDotIndex = next.addDot(point.x, point.y, 0, 0, defaultWeight, event.ctrlKey);
        if (selectedDotA !== null && selectedDotA !== newDotIndex) {
          next.addLine(selectedDotA, newDotIndex, defaultStiffness);
        }
        nextSelectedDot = newDotIndex;
      });
      setSelectedDots(nextSelectedDot, null);
      setSelectedLineIndex(null);
      return;
    }

    if (tool === "delete-link") {
      if (lineIndex >= 0) {
        const line = graph.lines[lineIndex];
        if (line) {
          updateGraph((next) => next.delLine(line.dot1, line.dot2));
        }
        setSelectedDots(null, null);
        setSelectedLineIndex(null);
        return;
      }
      if (dot < 0) {
        return;
      }
      if (selectedDotA === null) {
        setSelectedDots(dot, null);
      } else if (selectedDotA !== dot) {
        updateGraph((next) => next.delLine(selectedDotA, dot));
        setSelectedDots(null, null);
      } else {
        setSelectedDots(null, null);
      }
      return;
    }

    if (tool === "select") {
      if (event.ctrlKey && dot >= 0) {
        updateGraph((next) => next.setDotFixed(dot, !next.dots[dot].fixed));
        return;
      }
      if (event.shiftKey && dot >= 0) {
        setDragDotIndex(dot);
        return;
      }
      if (dot >= 0) {
        if (selectedDotA === null) {
          setSelectedDots(dot, null);
        } else if (selectedDotA !== dot && graph.existsLine(selectedDotA, dot)) {
          setSelectedDots(selectedDotA, dot);
          const line = graph.lines.findIndex(
            (l) => (l.dot1 === selectedDotA && l.dot2 === dot) || (l.dot2 === selectedDotA && l.dot1 === dot),
          );
          setSelectedLineIndex(line >= 0 ? line : null);
        } else {
          setSelectedDots(dot, null);
          setSelectedLineIndex(null);
        }
      } else if (lineIndex >= 0) {
        setSelectedLineIndex(lineIndex);
      } else {
        setSelectedDots(null, null);
        setSelectedLineIndex(null);
      }
    }
  }

  function handleMouseUp(event: React.MouseEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) {
      return;
    }

    const point = screenToWorld(getScreenPoint(event));
    setDragDotIndex(null);
    setDragStart(null);
    setGroupMoveSnapshot(null);

    if (tool === "drag-point" && pendingGroupRect) {
      const normalized = normalizeRect(pendingGroupRect);
      const width = normalized.x2 - normalized.x1;
      const height = normalized.y2 - normalized.y1;
      if (width > MIN_GROUP_SIZE && height > MIN_GROUP_SIZE) {
        setDragGroupRect(normalized);
      }
      setPendingGroupRect(null);
      return;
    }

    if (tool === "modify-group" && pendingGroupRect) {
      const normalized = normalizeRect(pendingGroupRect);
      const width = normalized.x2 - normalized.x1;
      const height = normalized.y2 - normalized.y1;
      if (width > MIN_GROUP_SIZE && height > MIN_GROUP_SIZE) {
        setDragGroupRect(normalized);
        openGroupDialog(normalized);
      }
      setPendingGroupRect(null);
      return;
    }

    if (tool === "move-group" && groupMoveBase) {
      const normalized = normalizeRect(dragGroupRect ?? groupMoveBase);
      setDragGroupRect(normalized);
      setGroupMoveBase(null);
      return;
    }

    if (tool === "hammer") {
      const charge =
        hammerPressStartRef.current === null
          ? hammerCharge
          : clamp((performance.now() - hammerPressStartRef.current) / HAMMER_CHARGE_MS, 0, 1);
      hammerPressStartRef.current = null;
      setHammerCharge(0);
      setHammerPreviewPoint(point);
      if (graph.dots.length === 0 || charge <= 0) {
        return;
      }
      onHammerImpact?.({
        impactX: point.x,
        impactY: point.y,
        charge,
        settings: {
          distribution: hammerSettings.distribution,
          weight: hammerSettings.weight,
          velocity: hammerSettings.velocity,
          restitution: hammerSettings.restitution,
          radius: hammerSettings.radius,
        },
      });
      void generateHammerOneShot({
        graph,
        impactX: point.x,
        impactY: point.y,
        charge,
        settings: hammerSettings,
        sampleRate: 44_100,
      })
        .then((result) => {
          onHammerPreview?.(result.buffer, result.sampleRate);
        })
        .catch((error) => {
          window.alert(error instanceof Error ? error.message : "Hammer one-shot generation failed");
        });
      return;
    }

    if (tool === "select" && !event.shiftKey) {
      setCursor(point.x, point.y);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    const point = getScreenPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomViewport(factor, point.x, point.y);
  }

  function handleContextMenu(event: React.MouseEvent<HTMLCanvasElement>): void {
    event.preventDefault();

    const point = screenToWorld(getScreenPoint(event));
    const dot = graph.getDotIndexByCoords(point.x, point.y, (DOT_RADIUS * 2) / viewportScale);
    const lineIndex = graph.getLineIndexNearPoint(point.x, point.y, LINE_HIT_THRESHOLD / viewportScale);

    if (dot >= 0) {
      setSelectedDots(dot, null);
      setSelectedLineIndex(null);
      openDotDialog(dot);
      return;
    }

    if (lineIndex >= 0) {
      const line = graph.lines[lineIndex];
      setSelectedDots(line.dot1, line.dot2);
      setSelectedLineIndex(lineIndex);
      openLineDialog(lineIndex);
    }
  }

  return (
    <div className="graph-canvas-wrap" ref={containerRef}>
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="graph-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onMouseLeave={() => {
          setHoveredDot(null);
          setHoveredLine(null);
          setDragDotIndex(null);
          setDragStart(null);
          setHammerPreviewPoint(null);
          setHammerCharge(0);
          hammerPressStartRef.current = null;
        }}
        style={{ cursor: cursorMap[tool] ?? "default" }}
      />
    </div>
  );
}

function normalizeRect(rect: Rect): Rect {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

function isPointInRect(x: number, y: number, rect: Rect): boolean {
  const n = normalizeRect(rect);
  return x >= n.x1 && x <= n.x2 && y >= n.y1 && y <= n.y2;
}

function drawRect(ctx: CanvasRenderingContext2D, rect: Rect, color: string, scale = 1): void {
  const n = normalizeRect(rect);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([5 / scale, 4 / scale]);
  ctx.strokeRect(n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1);
  ctx.restore();
}

function drawHammerPreview(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
  charge: number,
  scale = 1,
): void {
  const alpha = 0.15 + clamp(charge, 0, 1) * 0.35;
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeStyle = `rgba(220, 20, 60, ${0.45 + alpha})`;
  ctx.fillStyle = `rgba(220, 20, 60, ${alpha})`;
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(1, radius), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
