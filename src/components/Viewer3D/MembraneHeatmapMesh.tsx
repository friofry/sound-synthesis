import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import Delaunator from "delaunator";
import { DEFAULT_VIEWER_STEPPER_SETTINGS } from "../../config/defaults";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { GraphModel } from "../../engine/graph";
import { createRuntimeSimulationStepper } from "../../engine/simulation";
import type { RuntimeSimulationStepper } from "../../engine/simulation";
import type { SimulationBackend, SimulationParams } from "../../engine/types";
import { useMembraneViewerStore } from "../../store/membraneViewerStore";
import { useViewerStore } from "../../store/viewerStore";
import { registerMembraneRuntimeAccessor } from "./liveRuntimeBridge";
import { computeRange, heatmapColor, normalizeByRange } from "./heatmap";

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

const VIEWER_LIVE_METHOD: SimulationParams["method"] = DEFAULT_VIEWER_STEPPER_SETTINGS.method;
const VIEWER_LIVE_BACKEND: SimulationBackend = DEFAULT_VIEWER_STEPPER_SETTINGS.backend;
const FALLBACK_COLOR: [number, number, number] = [0.7, 0.7, 0.7];
const PLAIN_EDGE_COLOR: [number, number, number] = [0.0, 0.72, 1.0];
const PLAIN_SURFACE_COLOR: [number, number, number] = [0.14, 0.16, 0.2];

type MembraneHeatmapMeshProps = {
  heatmapEnabled: boolean;
};

export function MembraneHeatmapMesh({ heatmapEnabled }: MembraneHeatmapMeshProps) {
  const edgeMeshRef = useRef<LineSegments>(null);
  const edgeGeometryRef = useRef<BufferGeometry | null>(null);
  const edgePositionsRef = useRef<Float32Array | null>(null);
  const surfaceMeshRef = useRef<Mesh>(null);
  const surfaceGeometryRef = useRef<BufferGeometry | null>(null);
  const surfacePositionsRef = useRef<Float32Array | null>(null);
  const runtimeStepperRef = useRef<RuntimeSimulationStepper | null>(null);
  const prevPlayingRef = useRef(false);
  const prevStructureSignatureRef = useRef<string | null>(null);

  const edgeMaterial = useMemo(
    () => new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }),
    [],
  );
  const surfaceMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        vertexColors: true,
        side: DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    [],
  );

  const activeSource = useMembraneViewerStore((state) => state.activeSource);
  const activeSnapshot = useMembraneViewerStore((state) => state.snapshots[state.activeSource]);
  const graph = activeSnapshot?.graph ?? EMPTY_GRAPH;
  const sourcePerturbation = activeSnapshot?.perturbation ?? EMPTY_GRAPH.editorPerturbation;
  const snapshotRevision = activeSnapshot?.revision ?? 0;

  const normalizedDots = useMemo(() => {
    const dots = graph.getDotsForPerturbation(sourcePerturbation);
    if (dots.length === 0) {
      return [];
    }
    const bounds = computeBounds(dots);
    return dots.map((dot) => ({
      x: ((dot.x - bounds.minX) / bounds.width) * 4 - 2,
      z: ((dot.y - bounds.minY) / bounds.height) * 2 - 1,
      u: dot.u,
      fixed: dot.fixed,
      weight: dot.weight,
    }));
  }, [graph, sourcePerturbation, snapshotRevision]);

  const stiffnessRange = useMemo(() => computeRange(graph.lines.map((line) => line.k)), [graph.lines]);

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
    return sum.map((value, index) => (count[index] > 0 ? value / count[index] : stiffnessRange.min));
  }, [graph.dots.length, graph.lines, stiffnessRange]);

  const combinedHeatValues = useMemo(() => {
    const rawValues = normalizedDots.map((dot, index) => {
      const avgK = dotAverageStiffness[index] ?? stiffnessRange.min;
      const mass = Math.max(dot.weight, 1e-9);
      const ratio = avgK / mass;
      return Math.sqrt(Math.max(0, ratio));
    });
    const range = computeRange(rawValues);
    return rawValues.map((value) => normalizeByRange(value, range));
  }, [dotAverageStiffness, normalizedDots, stiffnessRange]);

  const surfaceColorTriples = useMemo(
    () => combinedHeatValues.map((value) => heatmapColor(value)),
    [combinedHeatValues],
  );
  const edgeColorTriples = useMemo(
    () =>
      graph.lines.map((line) => {
        const t = ((combinedHeatValues[line.dot1] ?? 0.5) + (combinedHeatValues[line.dot2] ?? 0.5)) * 0.5;
        return heatmapColor(t);
      }),
    [combinedHeatValues, graph.lines],
  );

  const surfaceIndices = useMemo(() => {
    if (normalizedDots.length < 3) {
      return null;
    }
    const triangulation = Delaunator.from(
      normalizedDots,
      (dot) => dot.x,
      (dot) => dot.z,
    );
    return triangulation.triangles.length > 0 ? triangulation.triangles : null;
  }, [normalizedDots]);

  const structureSignature = useMemo(
    () => `${activeSource}#${snapshotRevision}#${buildGraphStructureSignature(graph, sourcePerturbation)}`,
    [activeSource, graph, sourcePerturbation, snapshotRevision],
  );

  useEffect(() => {
    registerMembraneRuntimeAccessor(() => runtimeStepperRef.current);
    return () => registerMembraneRuntimeAccessor(null);
  }, []);

  useEffect(() => {
    const edgeMesh = edgeMeshRef.current;
    if (!edgeMesh) {
      return;
    }

    if (edgeGeometryRef.current) {
      edgeGeometryRef.current.dispose();
      edgeGeometryRef.current = null;
      edgePositionsRef.current = null;
    }

    const lineCount = graph.lines.length;
    const positions = new Float32Array(lineCount * 2 * 3);
    const colors = new Float32Array(lineCount * 2 * 3);
    edgePositionsRef.current = positions;

    const amplitudeScale = useViewerStore.getState().amplitudeScale;
    let cursor = 0;
    let colorCursor = 0;

    for (let index = 0; index < graph.lines.length; index += 1) {
      const line = graph.lines[index];
      const a = normalizedDots[line.dot1];
      const b = normalizedDots[line.dot2];
      const edgeColor = heatmapEnabled ? (edgeColorTriples[index] ?? FALLBACK_COLOR) : PLAIN_EDGE_COLOR;

      if (!a || !b) {
        cursor += 6;
        colorCursor += 6;
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

      colors[colorCursor++] = edgeColor[0];
      colors[colorCursor++] = edgeColor[1];
      colors[colorCursor++] = edgeColor[2];
      colors[colorCursor++] = edgeColor[0];
      colors[colorCursor++] = edgeColor[1];
      colors[colorCursor++] = edgeColor[2];
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    edgeGeometryRef.current = geometry;
    edgeMesh.geometry = geometry;
  }, [edgeColorTriples, graph.lines, heatmapEnabled, normalizedDots]);

  useEffect(() => {
    const surfaceMesh = surfaceMeshRef.current;
    if (!surfaceMesh) {
      return;
    }

    if (surfaceGeometryRef.current) {
      surfaceGeometryRef.current.dispose();
      surfaceGeometryRef.current = null;
      surfacePositionsRef.current = null;
    }

    if (!surfaceIndices || normalizedDots.length < 3) {
      surfaceMesh.geometry = new BufferGeometry();
      return;
    }

    const amplitudeScale = useViewerStore.getState().amplitudeScale;
    const positions = new Float32Array(normalizedDots.length * 3);
    const colors = new Float32Array(normalizedDots.length * 3);

    for (let index = 0; index < normalizedDots.length; index += 1) {
      const dot = normalizedDots[index];
      const color = heatmapEnabled ? (surfaceColorTriples[index] ?? FALLBACK_COLOR) : PLAIN_SURFACE_COLOR;
      const base = index * 3;
      positions[base] = dot.x;
      positions[base + 1] = dot.fixed ? 0 : dot.u * amplitudeScale;
      positions[base + 2] = dot.z;
      colors[base] = color[0];
      colors[base + 1] = color[1];
      colors[base + 2] = color[2];
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setIndex(Array.from(surfaceIndices));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    surfaceGeometryRef.current = geometry;
    surfacePositionsRef.current = positions;
    surfaceMesh.geometry = geometry;
  }, [heatmapEnabled, normalizedDots, surfaceColorTriples, surfaceIndices]);

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

    const edgePositions = edgePositionsRef.current;
    const edgeGeometry = edgeGeometryRef.current;
    const surfacePositions = surfacePositionsRef.current;
    const surfaceGeometry = surfaceGeometryRef.current;

    if (!edgePositions || !edgeGeometry || graph.dots.length === 0) {
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

    let edgeCursor = 0;
    for (const line of graph.lines) {
      const a = normalizedDots[line.dot1];
      const b = normalizedDots[line.dot2];
      if (!a || !b) {
        edgeCursor += 6;
        continue;
      }

      const ay = a.fixed ? 0 : (runtimeState.u[line.dot1] ?? 0) * amplitudeScale;
      const by = b.fixed ? 0 : (runtimeState.u[line.dot2] ?? 0) * amplitudeScale;

      edgePositions[edgeCursor++] = a.x;
      edgePositions[edgeCursor++] = ay;
      edgePositions[edgeCursor++] = a.z;
      edgePositions[edgeCursor++] = b.x;
      edgePositions[edgeCursor++] = by;
      edgePositions[edgeCursor++] = b.z;
    }

    if (surfacePositions && surfaceGeometry) {
      for (let index = 0; index < normalizedDots.length; index += 1) {
        const dot = normalizedDots[index];
        surfacePositions[index * 3 + 1] = dot.fixed ? 0 : (runtimeState.u[index] ?? 0) * amplitudeScale;
      }
    }

    const edgeAttribute = edgeGeometry.getAttribute("position") as BufferAttribute;
    edgeAttribute.needsUpdate = true;
    edgeGeometry.computeBoundingSphere();

    if (surfaceGeometry) {
      const surfaceAttribute = surfaceGeometry.getAttribute("position") as BufferAttribute;
      surfaceAttribute.needsUpdate = true;
      surfaceGeometry.computeVertexNormals();
      surfaceGeometry.computeBoundingSphere();
    }

    if (playing) {
      useViewerStore.getState().advanceFrame(0);
    }
  });

  return (
    <group>
      <mesh ref={surfaceMeshRef} material={surfaceMaterial} />
      <lineSegments ref={edgeMeshRef} material={edgeMaterial} />
    </group>
  );
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
