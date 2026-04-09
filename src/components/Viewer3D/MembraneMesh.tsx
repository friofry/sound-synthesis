import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_VIEWER_STEPPER_SETTINGS } from "../../config/defaults";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from "three";
import { GraphModel } from "../../engine/graph";
import type { SimulationParams } from "../../engine/types";
import type { SimulationBackend } from "../../engine/types";
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
const VIEWER_LIVE_METHOD: SimulationParams["method"] = DEFAULT_VIEWER_STEPPER_SETTINGS.method;
const VIEWER_LIVE_BACKEND: SimulationBackend = DEFAULT_VIEWER_STEPPER_SETTINGS.backend;

export function MembraneMesh() {
  const meshRef = useRef<LineSegments>(null);
  const geometryRef = useRef<BufferGeometry | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const runtimeStepperRef = useRef<RuntimeSimulationStepper | null>(null);
  const prevPlayingRef = useRef(false);
  const prevStructureSignatureRef = useRef<string | null>(null);
  const activeSource = useMembraneViewerStore((state) => state.activeSource);
  const activeSnapshot = useMembraneViewerStore((state) => state.snapshots[state.activeSource]);
  const graph = activeSnapshot?.graph ?? EMPTY_GRAPH;
  const sourcePerturbation = activeSnapshot?.perturbation ?? EMPTY_GRAPH.editorPerturbation;
  const snapshotRevision = activeSnapshot?.revision ?? 0;

  const normalizedDots = useMemo(() => {
    const dots = graph.getDotsForPerturbation(sourcePerturbation);
    if (dots.length === 0) return [];
    const bounds = computeBounds(dots);
    return dots.map((dot) => ({
      x: ((dot.x - bounds.minX) / bounds.width) * 4 - 2,
      z: ((dot.y - bounds.minY) / bounds.height) * 2 - 1,
      u: dot.u,
      fixed: dot.fixed,
    }));
  }, [graph, sourcePerturbation]);
  const structureSignature = useMemo(
    () => `${activeSource}#${snapshotRevision}#${buildGraphStructureSignature(graph, sourcePerturbation)}`,
    [activeSource, graph, sourcePerturbation, snapshotRevision],
  );

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
    }

    prevStructureSignatureRef.current = structureSignature;
  }, [structureSignature]);

  useFrame(() => {
    const { playing, frameIndex, amplitudeScale, speed } = useViewerStore.getState();
    const wasPlaying = prevPlayingRef.current;
    const justStarted = !wasPlaying && playing;
    prevPlayingRef.current = playing;

    const positions = positionsRef.current;
    const geo = geometryRef.current;
    if (!positions || !geo || graph.dots.length === 0) {
      return;
    }

    const shouldReinitialize = (justStarted && frameIndex === 0) || !runtimeStepperRef.current;
    if (shouldReinitialize || !runtimeStepperRef.current) {
      const playingPoint = graph.resolvePlayingPoint(sourcePerturbation);
      runtimeStepperRef.current = createRuntimeSimulationStepper(
        graph.toGraphData(sourcePerturbation),
        buildViewerLiveSimulationParams(playingPoint),
        VIEWER_LIVE_BACKEND,
      );
    }

    const runtimeStepper = runtimeStepperRef.current;
    if (!runtimeStepper) {
      return;
    }

    if (playing) {
      const steps = Math.max(1, Math.floor(speed));
      runtimeStepper.step(steps);
    }
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

    if (playing) {
      useViewerStore.getState().advanceFrame(0);
    }
  });

  return <lineSegments ref={meshRef} material={material} />;
}

function buildGraphStructureSignature(graph: GraphModel, perturbation: Parameters<GraphModel["getDotsForPerturbation"]>[0]): string {
  const dots = graph
    .getDotsForPerturbation(perturbation)
    .map((dot) => `${Number(dot.fixed)}:${dot.weight}:${dot.u}:${dot.v}`)
    .join("|");
  const lines = graph.lines.map((line) => `${line.dot1}:${line.dot2}:${line.k}`).join("|");
  return `${graph.resolvePlayingPoint(perturbation)}#${dots}#${lines}`;
}

function buildViewerLiveSimulationParams(playingPoint: number): SimulationParams {
  return {
    sampleRate: DEFAULT_VIEWER_STEPPER_SETTINGS.sampleRate,
    lengthK: resolveLengthK(
      DEFAULT_VIEWER_STEPPER_SETTINGS.durationMs,
      DEFAULT_VIEWER_STEPPER_SETTINGS.sampleRate,
      DEFAULT_VIEWER_STEPPER_SETTINGS.tillSilence,
    ),
    method: VIEWER_LIVE_METHOD,
    attenuation: DEFAULT_VIEWER_STEPPER_SETTINGS.attenuation,
    squareAttenuation: DEFAULT_VIEWER_STEPPER_SETTINGS.squareAttenuation,
    playingPoint,
    substepsMode: DEFAULT_VIEWER_STEPPER_SETTINGS.substepsMode,
    substeps: DEFAULT_VIEWER_STEPPER_SETTINGS.substeps,
  };
}

const EMPTY_GRAPH = new GraphModel();

function resolveLengthK(durationMs: number, sampleRate: number, tillSilence: boolean): number {
  const safeDurationMs = Math.max(1, durationMs);
  const effectiveDurationMs = tillSilence ? Math.max(safeDurationMs * 3, 1000) : safeDurationMs;
  const sampleCount = Math.ceil((sampleRate * effectiveDurationMs) / 1000);
  return Math.max(1, Math.ceil(sampleCount / 1024));
}
