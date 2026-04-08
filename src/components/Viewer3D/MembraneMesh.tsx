import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from "three";
import { GraphModel } from "../../engine/graph";
import { resolveDefaultSimulationBackend } from "../../engine/simulationDefaults";
import type { SimulationParams } from "../../engine/types";
import { DEFAULT_ATTENUATION, DEFAULT_SQUARE_ATTENUATION } from "../../engine/types";
import { useMembraneViewerStore } from "../../store/membraneViewerStore";
import { useViewerStore } from "../../store/viewerStore";
import {
  createRuntimeSimulationStepper,
} from "../../engine/simulation";
import type { RuntimeSimulationStepper } from "../../engine/simulation";
import { registerMembraneRuntimeAccessor } from "./liveRuntimeBridge";

function computeBounds(points: { x: number; y: number }[]) {
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
  };
}

const material = new LineBasicMaterial({ color: "#00b8ff" });
const VIEWER_LIVE_METHOD: SimulationParams["method"] = "runge-kutta";
const VIEWER_LIVE_PRECISION = 64 as const;
const VIEWER_LIVE_BACKEND = resolveDefaultSimulationBackend(VIEWER_LIVE_METHOD, VIEWER_LIVE_PRECISION);

export function MembraneMesh() {
  const meshRef = useRef<LineSegments>(null);
  const geometryRef = useRef<BufferGeometry | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const runtimeStepperRef = useRef<RuntimeSimulationStepper | null>(null);
  const prevPlayingRef = useRef(false);
  const prevStructureSignatureRef = useRef<string | null>(null);
  const activeSource = useMembraneViewerStore((state) => state.activeSource);
  const activeSnapshot = useMembraneViewerStore((state) => state.snapshots[state.activeSource]);
  const syncRuntimeStateToActiveSnapshot = useMembraneViewerStore((state) => state.syncRuntimeStateToActiveSnapshot);
  const graph = activeSnapshot?.graph ?? EMPTY_GRAPH;

  const normalizedDots = useMemo(() => {
    if (graph.dots.length === 0) return [];
    const bounds = computeBounds(graph.dots);
    return graph.dots.map((dot) => ({
      x: ((dot.x - bounds.minX) / bounds.width) * 4 - 2,
      z: ((dot.y - bounds.minY) / bounds.height) * 2 - 1,
      u: dot.u,
      fixed: dot.fixed,
    }));
  }, [graph.dots]);
  const structureSignature = useMemo(() => `${activeSource}#${buildGraphStructureSignature(graph)}`, [activeSource, graph]);

  useEffect(() => {
    registerMembraneRuntimeAccessor(() => runtimeStepperRef.current);
    return () => registerMembraneRuntimeAccessor(null);
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const lineCount = graph.lines.length;

    if (geometryRef.current) {
      geometryRef.current.dispose();
    }

    const positions = new Float32Array(lineCount * 2 * 3);
    positionsRef.current = positions;

    const amplitudeScale = useViewerStore.getState().amplitudeScale;
    let cursor = 0;
    for (const line of graph.lines) {
      const a = normalizedDots[line.dot1];
      const b = normalizedDots[line.dot2];
      if (!a || !b) {
        cursor += 6;
        continue;
      }
      const ay = a.fixed ? 0 : a.u * amplitudeScale;
      const by = b.fixed ? 0 : b.u * amplitudeScale;

      positions[cursor++] = a.x;
      positions[cursor++] = ay;
      positions[cursor++] = a.z;
      positions[cursor++] = b.x;
      positions[cursor++] = by;
      positions[cursor++] = b.z;
    }

    const geo = new BufferGeometry();
    const attr = new BufferAttribute(positions, 3);
    attr.setUsage(35048); // DynamicDrawUsage
    geo.setAttribute("position", attr);
    geo.computeBoundingSphere();
    geometryRef.current = geo;

    mesh.geometry = geo;
  }, [normalizedDots, graph.lines]);

  useEffect(() => {
    const structureChanged =
      prevStructureSignatureRef.current !== null && prevStructureSignatureRef.current !== structureSignature;

    if (structureChanged) {
      runtimeStepperRef.current = null;
      prevPlayingRef.current = false;
    } else if (runtimeStepperRef.current) {
      // Keep live playback running and inject freshly painted displacement
      // without wiping the accumulated runtime velocity.
      syncRuntimeStateFromGraph(runtimeStepperRef.current, graph);
    }

    prevStructureSignatureRef.current = structureSignature;
  }, [graph, structureSignature]);

  useFrame(() => {
    const { playing, frameIndex, amplitudeScale, speed } = useViewerStore.getState();
    const wasPlaying = prevPlayingRef.current;
    const justStarted = !wasPlaying && playing;
    const justStopped = wasPlaying && !playing;
    prevPlayingRef.current = playing;

    if (justStopped && runtimeStepperRef.current) {
      syncRuntimeStateToActiveSnapshot(runtimeStepperRef.current.state.u, runtimeStepperRef.current.state.v);
    }

    if (!playing) {
      return;
    }

    const positions = positionsRef.current;
    const geo = geometryRef.current;
    if (!positions || !geo || graph.dots.length === 0) {
      return;
    }

    const shouldReinitialize = justStarted && frameIndex === 0;
    if (shouldReinitialize || !runtimeStepperRef.current) {
      runtimeStepperRef.current = createRuntimeSimulationStepper(
        graph.toGraphData(),
        buildViewerLiveSimulationParams(graph.playingPoint ?? graph.findFirstPlayableDot()),
        VIEWER_LIVE_BACKEND,
      );
    }

    const runtimeStepper = runtimeStepperRef.current;
    if (!runtimeStepper) {
      return;
    }

    const steps = Math.max(1, Math.floor(speed));
    runtimeStepper.step(steps);
    const runtimeState = runtimeStepper.state;

    let cursor = 0;
    for (const line of graph.lines) {
      const a = normalizedDots[line.dot1];
      const b = normalizedDots[line.dot2];
      if (!a || !b) {
        cursor += 6;
        continue;
      }

      const ay = a.fixed ? 0 : (runtimeState.u[line.dot1] ?? 0) * amplitudeScale;
      const by = b.fixed ? 0 : (runtimeState.u[line.dot2] ?? 0) * amplitudeScale;

      positions[cursor++] = a.x;
      positions[cursor++] = ay;
      positions[cursor++] = a.z;
      positions[cursor++] = b.x;
      positions[cursor++] = by;
      positions[cursor++] = b.z;
    }

    const attr = geo.getAttribute("position") as BufferAttribute;
    attr.needsUpdate = true;
    geo.computeBoundingSphere();

    useViewerStore.getState().advanceFrame(0);
  });

  return <lineSegments ref={meshRef} material={material} />;
}

function syncRuntimeStateFromGraph(runtimeStepper: RuntimeSimulationStepper, graph: GraphModel) {
  const { u } = runtimeStepper.state;
  const dotCount = Math.min(graph.dots.length, u.length);
  for (let i = 0; i < dotCount; i += 1) {
    const dot = graph.dots[i];
    if (!dot) {
      continue;
    }
    u[i] = dot.fixed ? 0 : dot.u;
  }
}

function buildGraphStructureSignature(graph: GraphModel): string {
  const dots = graph.dots.map((dot) => `${Number(dot.fixed)}:${dot.weight}`).join("|");
  const lines = graph.lines.map((line) => `${line.dot1}:${line.dot2}:${line.k}`).join("|");
  return `${graph.playingPoint ?? -1}#${dots}#${lines}`;
}

function buildViewerLiveSimulationParams(playingPoint: number): SimulationParams {
  return {
    sampleRate: 44_100,
    lengthK: 8,
    method: VIEWER_LIVE_METHOD,
    attenuation: DEFAULT_ATTENUATION,
    squareAttenuation: DEFAULT_SQUARE_ATTENUATION,
    playingPoint,
    substepsMode: "fixed",
    substeps: 1,
  };
}

const EMPTY_GRAPH = new GraphModel();
