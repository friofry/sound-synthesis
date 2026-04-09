import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { DoubleSide } from "three";
import { GraphModel } from "../../engine/graph";
import { scaleGraphForPitchRatio } from "../../engine/gridGenerators";
import { HeatmapSceneShell } from "./HeatmapSceneShell";
import { MembraneMesh } from "./MembraneMesh";
import { MembraneHeatmapMesh } from "./MembraneHeatmapMesh";
import { ViewerToolbar } from "./ViewerToolbar";
import { useGraphStore } from "../../store/graphStore";
import { useMembraneViewerStore } from "../../store/membraneViewerStore";
import { usePianoStore } from "../../store/pianoStore";
import { useViewerStore } from "../../store/viewerStore";
import { getMembraneRuntimeStepper } from "./liveRuntimeBridge";
import { computeRange } from "./heatmap";

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
};

function computeBounds(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1e-6, maxX - minX),
    height: Math.max(1e-6, maxY - minY),
  } satisfies Bounds;
}

export function MembraneViewer() {
  const editorGraph = useGraphStore((state) => state.graph);
  const instrumentNotes = usePianoStore((state) => state.instrumentNotes);
  const viewerBaseGraphSnapshots = usePianoStore((state) => state.viewerBaseGraphSnapshots);
  const lastPressedKeyIndex = usePianoStore((state) => state.lastPressedKeyIndex);
  const pressedKeys = usePianoStore((state) => state.pressedKeys);
  const activeSource = useMembraneViewerStore((state) => state.activeSource);
  const activeSnapshot = useMembraneViewerStore((state) => state.snapshots[state.activeSource]);
  const heatmapEnabled = useViewerStore((state) => state.heatmapEnabled);
  const initializeSource = useMembraneViewerStore((state) => state.initializeSource);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const paintSignRef = useRef(1);
  const isPaintingRef = useRef(false);
  const lastPaintPointRef = useRef<{ x: number; y: number } | null>(null);
  const graph = activeSnapshot?.graph ?? EMPTY_GRAPH;

  useEffect(() => {
    initializeSource("editor", editorGraph, { activate: false, perturbation: editorGraph.editorPerturbation });
  }, [editorGraph, initializeSource]);

  useEffect(() => {
    if (lastPressedKeyIndex === null) {
      return;
    }
    const note = instrumentNotes[lastPressedKeyIndex];
    const viewerSource = note?.viewerSource;
    if (!viewerSource?.baseGraphSnapshotId || !Number.isFinite(viewerSource.tunedRatio)) {
      return;
    }
    const baseSnapshot = viewerBaseGraphSnapshots[viewerSource.baseGraphSnapshotId];
    if (!baseSnapshot) {
      return;
    }
    const source = "note-generated" as const;
    const keyIsPressedNow = pressedKeys.has(lastPressedKeyIndex);
    const shouldActivate = keyIsPressedNow || activeSource === source;
    const baseGraph = GraphModel.fromJSON(baseSnapshot);
    const noteGraph = scaleGraphForPitchRatio(baseGraph, viewerSource.tunedRatio ?? 1);
    noteGraph.playingPoint = baseGraph.playingPoint ?? baseGraph.findFirstPlayableDot();
    initializeSource(source, noteGraph, {
      activate: shouldActivate,
      perturbation: viewerSource.perturbation,
      // Rebuild note snapshot on every fresh key press so previous paint
      // or runtime deformations do not persist when revisiting this note.
      force: keyIsPressedNow,
    });
  }, [activeSource, initializeSource, instrumentNotes, lastPressedKeyIndex, pressedKeys, viewerBaseGraphSnapshots]);

  const bounds = useMemo(() => computeBounds(graph.dots), [graph.dots]);
  const brushRadius = useMemo(() => {
    if (!bounds) {
      return 12;
    }
    return Math.max(12, Math.max(bounds.width, bounds.height) * 0.06);
  }, [bounds]);
  const dotAverageStiffness = useMemo(() => {
    if (graph.dots.length === 0) {
      return [];
    }
    const sum = new Array<number>(graph.dots.length).fill(0);
    const count = new Array<number>(graph.dots.length).fill(0);
    for (const line of graph.lines) {
      if (line.dot1 < graph.dots.length) {
        sum[line.dot1] += line.k;
        count[line.dot1] += 1;
      }
      if (line.dot2 < graph.dots.length) {
        sum[line.dot2] += line.k;
        count[line.dot2] += 1;
      }
    }
    return sum.map((value, index) => (count[index] > 0 ? value / count[index] : 0));
  }, [graph.dots.length, graph.lines]);

  const combinedRange = useMemo(() => {
    const rawValues = graph.dots.map((dot, index) => {
      const avgK = dotAverageStiffness[index] ?? 0;
      const mass = Math.max(dot.weight, 1e-9);
      return Math.sqrt(Math.max(0, avgK / mass));
    });
    return computeRange(rawValues);
  }, [dotAverageStiffness, graph.dots]);

  const normalizedDots = useMemo(() => {
    if (!bounds) {
      return [];
    }

    return graph.dots.map((dot, index) => ({
      index,
      x: ((dot.x - bounds.minX) / bounds.width) * 4 - 2,
      z: ((dot.y - bounds.minY) / bounds.height) * 2 - 1,
      fixed: dot.fixed,
    }));
  }, [bounds, graph.dots]);

  useEffect(() => {
    const handleWindowPointerStop = () => {
      if (!isPaintingRef.current) {
        return;
      }
      isPaintingRef.current = false;
      lastPaintPointRef.current = null;
      setOrbitEnabled(true);
    };

    window.addEventListener("pointerup", handleWindowPointerStop);
    window.addEventListener("pointercancel", handleWindowPointerStop);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerStop);
      window.removeEventListener("pointercancel", handleWindowPointerStop);
    };
  }, []);

  const stopPainting = () => {
    if (!isPaintingRef.current) {
      return;
    }
    isPaintingRef.current = false;
    lastPaintPointRef.current = null;
    setOrbitEnabled(true);
  };

  const applyAmplitudeBrush = (graphX: number, graphY: number, amount: number) => {
    const sigma = Math.max(1, brushRadius * 0.45);
    const minDistance = Math.max(4, brushRadius * 0.18);
    const previousPoint = lastPaintPointRef.current;
    if (previousPoint && Math.hypot(previousPoint.x - graphX, previousPoint.y - graphY) < minDistance) {
      return;
    }

    const runtimeStepper = getMembraneRuntimeStepper();
    if (!runtimeStepper) {
      return;
    }

    lastPaintPointRef.current = { x: graphX, y: graphY };
    const runtimeU = runtimeStepper.state.u;
    let changed = false;
    for (let index = 0; index < graph.dots.length; index += 1) {
      const dot = graph.dots[index];
      if (!dot || dot.fixed || index >= runtimeU.length) {
        continue;
      }

      const dist = Math.hypot(dot.x - graphX, dot.y - graphY);
      if (dist > brushRadius) {
        continue;
      }

      const factor = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      const baseU = runtimeU[index];
      const safeBaseU = Number.isFinite(baseU) ? baseU : 0;
      const nextU = clamp(safeBaseU + amount * factor, -1, 1);
      if (nextU === safeBaseU) {
        continue;
      }

      changed = true;
      runtimeU[index] = nextU;
    }

    if (!changed) {
      lastPaintPointRef.current = previousPoint;
    }
  };

  const tryPaint = (event: ThreeEvent<PointerEvent>, force = false) => {
    if (!bounds) {
      return;
    }

    const graphPoint = viewerToGraph(event.point.x, event.point.z, bounds);
    const hasNearbyPlayableDot = graph.dots.some((dot) => {
      if (dot.fixed) {
        return false;
      }
      return Math.hypot(dot.x - graphPoint.x, dot.y - graphPoint.y) <= brushRadius;
    });

    if (!hasNearbyPlayableDot) {
      if (!force) {
        stopPainting();
      }
      return;
    }

    applyAmplitudeBrush(graphPoint.x, graphPoint.y, paintSignRef.current * 0.18);
  };

  const handleBrushPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    if (!bounds || normalizedDots.length === 0) {
      return;
    }

    const graphPoint = viewerToGraph(event.point.x, event.point.z, bounds);
    const hasNearbyPlayableDot = graph.dots.some((dot) => {
      if (dot.fixed) {
        return false;
      }
      return Math.hypot(dot.x - graphPoint.x, dot.y - graphPoint.y) <= brushRadius;
    });

    if (!hasNearbyPlayableDot) {
      return;
    }

    event.stopPropagation();
    paintSignRef.current = event.button === 2 ? -1 : 1;
    isPaintingRef.current = true;
    lastPaintPointRef.current = null;
    setOrbitEnabled(false);
    applyAmplitudeBrush(graphPoint.x, graphPoint.y, paintSignRef.current * 0.18);
  };

  const handleBrushPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!isPaintingRef.current) {
      return;
    }
    if (event.buttons === 0) {
      stopPainting();
      return;
    }
    event.stopPropagation();
    tryPaint(event);
  };

  const handleBrushPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!isPaintingRef.current) {
      return;
    }
    event.stopPropagation();
    stopPainting();
  };

  return (
    <>
      <ViewerToolbar />
      <div className="viewer-canvas-wrap">
        <Canvas
          camera={{ position: [0, 2.5, 5.5], fov: 50 }}
          onCreated={({ gl }) => {
            gl.setClearColor("#020202");
            gl.domElement.oncontextmenu = (e) => e.preventDefault();
          }}
        >
          <HeatmapSceneShell enabled={heatmapEnabled} membraneDots={normalizedDots} />
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={handleBrushPointerDown}
            onPointerMove={handleBrushPointerMove}
            onPointerUp={handleBrushPointerUp}
          >
            <planeGeometry args={[4, 2]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          <group>
            {heatmapEnabled ? <MembraneHeatmapMesh heatmapEnabled /> : <MembraneMesh />}
          </group>
          <OrbitControls enableDamping dampingFactor={0.08} enabled={orbitEnabled} />
        </Canvas>
        {heatmapEnabled ? (
          <div className="viewer-heatmap-legend" aria-hidden="true">
            <div className="viewer-heatmap-legend-row">
              <div className="viewer-heatmap-legend-title">Local frequency sqrt(k/m)</div>
              <div className="viewer-heatmap-legend-scale viewer-heatmap-legend-scale-combined" />
              <div className="viewer-heatmap-legend-values">
                <span>{formatLegendValue(combinedRange.min)}</span>
                <span>{formatLegendValue(combinedRange.max)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function viewerToGraph(x: number, z: number, bounds: Bounds): { x: number; y: number } {
  return {
    x: bounds.minX + ((x + 2) / 4) * bounds.width,
    y: bounds.minY + ((z + 1) / 2) * bounds.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatLegendValue(value: number): string {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.001) {
    return value.toExponential(1);
  }
  if (abs >= 1000) {
    return value.toExponential(1);
  }
  return value.toFixed(abs >= 10 ? 1 : 3);
}

const EMPTY_GRAPH = new GraphModel();
