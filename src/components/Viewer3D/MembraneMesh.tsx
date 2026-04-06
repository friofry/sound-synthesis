import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from "three";
import { useGraphStore } from "../../store/graphStore";
import { useViewerStore } from "../../store/viewerStore";
import {
  createConnectionStructure,
  eulerCramerStep,
  rungeKuttaStep,
} from "../../engine/simulation";
import type { SimulationState } from "../../engine/types";

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

export function MembraneMesh() {
  const meshRef = useRef<LineSegments>(null);
  const geometryRef = useRef<BufferGeometry | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const runtimeStateRef = useRef<SimulationState | null>(null);
  const runtimeCoeffsRef = useRef<ReturnType<typeof createConnectionStructure> | null>(null);
  const prevPlayingRef = useRef(false);

  const graph = useGraphStore((s) => s.graph);
  const simulationResult = useGraphStore((s) => s.simulationResult);
  const simulationParams = useGraphStore((s) => s.simulationParams);

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

  const frames = useMemo(
    () => simulationResult?.frames ?? [],
    [simulationResult],
  );

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
    runtimeStateRef.current = null;
    runtimeCoeffsRef.current = null;
    prevPlayingRef.current = false;
  }, [graph, simulationParams]);

  useFrame(() => {
    const { playing, frameIndex, amplitudeScale } =
      useViewerStore.getState();

    if (!playing || frames.length === 0) return;

    const positions = positionsRef.current;
    const geo = geometryRef.current;
    if (!positions || !geo) return;

    const frame = frames[frameIndex];
    if (!frame) return;

    let cursor = 0;
    for (const line of graph.lines) {
      const a = normalizedDots[line.dot1];
      const b = normalizedDots[line.dot2];
      if (!a || !b) {
        cursor += 6;
        continue;
      }

      const ay = a.fixed ? 0 : (frame[line.dot1] ?? 0) * amplitudeScale;
      const by = b.fixed ? 0 : (frame[line.dot2] ?? 0) * amplitudeScale;

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

    useViewerStore.getState().advanceFrame(frames.length);
  });

  useFrame(() => {
    const { playing, frameIndex, amplitudeScale, speed } = useViewerStore.getState();
    const justStarted = !prevPlayingRef.current && playing;
    prevPlayingRef.current = playing;

    if (!playing || frames.length > 0) {
      return;
    }

    const positions = positionsRef.current;
    const geo = geometryRef.current;
    if (!positions || !geo || graph.dots.length === 0) {
      return;
    }

    const shouldReinitialize = justStarted && frameIndex === 0;
    if (shouldReinitialize || !runtimeStateRef.current || !runtimeCoeffsRef.current) {
      const u = new Float64Array(graph.dots.length);
      const v = new Float64Array(graph.dots.length);
      for (let i = 0; i < graph.dots.length; i += 1) {
        const dot = graph.dots[i];
        u[i] = dot.fixed ? 0 : dot.u;
        v[i] = dot.fixed ? 0 : dot.v;
      }
      runtimeStateRef.current = { u, v };
      runtimeCoeffsRef.current = createConnectionStructure({
        dots: graph.dots,
        lines: graph.lines,
        playingPoint: graph.playingPoint ?? simulationParams.playingPoint,
      });
    }

    const runtimeState = runtimeStateRef.current;
    const coeffs = runtimeCoeffsRef.current;
    if (!runtimeState || !coeffs) {
      return;
    }

    const dt = 1 / Math.max(1, simulationParams.sampleRate);
    const steps = Math.max(1, Math.floor(speed));
    for (let s = 0; s < steps; s += 1) {
      if (simulationParams.method === "runge-kutta") {
        rungeKuttaStep(
          runtimeState,
          coeffs,
          dt,
          simulationParams.attenuation,
          simulationParams.squareAttenuation,
        );
      } else {
        eulerCramerStep(
          runtimeState,
          coeffs,
          dt,
          simulationParams.attenuation,
          simulationParams.squareAttenuation,
        );
      }

      for (let i = 0; i < graph.dots.length; i += 1) {
        if (graph.dots[i].fixed) {
          runtimeState.u[i] = 0;
          runtimeState.v[i] = 0;
        }
      }
    }

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
