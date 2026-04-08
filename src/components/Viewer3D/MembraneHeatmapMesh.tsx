import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import Delaunator from "delaunator";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { GraphModel } from "../../engine/graph";
import { createRuntimeSimulationStepper } from "../../engine/simulation";
import type { RuntimeSimulationStepper } from "../../engine/simulation";
import { DEFAULT_ATTENUATION, DEFAULT_SQUARE_ATTENUATION } from "../../engine/types";
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

const VIEWER_LIVE_METHOD: SimulationParams["method"] = "runge-kutta";
const VIEWER_LIVE_BACKEND: SimulationBackend = "edge-list";
const POINT_RADIUS = 0.042;
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
  const pointsRef = useRef<InstancedMesh>(null);
  const runtimeStepperRef = useRef<RuntimeSimulationStepper | null>(null);
  const prevPlayingRef = useRef(false);
  const prevStructureSignatureRef = useRef<string | null>(null);
  const tempObject = useMemo(() => new Object3D(), []);
  const tempColor = useMemo(() => new Color(), []);

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
  const pointMaterial = useMemo(() => {
    const material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `
attribute float instanceAlpha;
varying float vInstanceAlpha;
${shader.vertexShader}
`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vInstanceAlpha = instanceAlpha;`,
      );
      shader.fragmentShader = `
varying float vInstanceAlpha;
${shader.fragmentShader}
`.replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );",
      );
    };
    return material;
  }, []);
  const pointGeometry = useMemo(() => new SphereGeometry(1, 10, 10), []);

  const activeSource = useMembraneViewerStore((state) => state.activeSource);
  const activeSnapshot = useMembraneViewerStore((state) => state.snapshots[state.activeSource]);
  const graph = activeSnapshot?.graph ?? EMPTY_GRAPH;
  const snapshotRevision = activeSnapshot?.revision ?? 0;

  const normalizedDots = useMemo(() => {
    if (graph.dots.length === 0) {
      return [];
    }
    const bounds = computeBounds(graph.dots);
    return graph.dots.map((dot) => ({
      x: ((dot.x - bounds.minX) / bounds.width) * 4 - 2,
      z: ((dot.y - bounds.minY) / bounds.height) * 2 - 1,
      u: dot.u,
      fixed: dot.fixed,
      weight: dot.weight,
    }));
  }, [graph.dots]);

  const stiffnessRange = useMemo(() => computeRange(graph.lines.map((line) => line.k)), [graph.lines]);
  const weightRange = useMemo(() => computeRange(graph.dots.map((dot) => dot.weight)), [graph.dots]);

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

  const surfaceColorTriples = useMemo(
    () =>
      dotAverageStiffness.map((value) => heatmapColor(normalizeByRange(value, stiffnessRange))),
    [dotAverageStiffness, stiffnessRange],
  );
  const edgeColorTriples = useMemo(
    () => graph.lines.map((line) => heatmapColor(normalizeByRange(line.k, stiffnessRange))),
    [graph.lines, stiffnessRange],
  );
  const pointVisuals = useMemo(
    () =>
      normalizedDots.map((dot) => {
        const t = normalizeByRange(dot.weight, weightRange);
        return {
          rgb: heatmapColor(0.15 + t * 0.7),
          alpha: 0.2 + t * 0.75,
        };
      }),
    [normalizedDots, weightRange],
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
    () => `${activeSource}#${snapshotRevision}#${buildGraphStructureSignature(graph)}`,
    [activeSource, graph, snapshotRevision],
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
    const pointsMesh = pointsRef.current;
    if (!pointsMesh) {
      return;
    }

    pointsMesh.count = normalizedDots.length;
    pointsMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const amplitudeScale = useViewerStore.getState().amplitudeScale;
    for (let index = 0; index < normalizedDots.length; index += 1) {
      const dot = normalizedDots[index];
      const point = pointVisuals[index];
      tempObject.position.set(dot.x, dot.fixed ? 0 : dot.u * amplitudeScale, dot.z);
      tempObject.scale.setScalar(POINT_RADIUS);
      tempObject.updateMatrix();
      pointsMesh.setMatrixAt(index, tempObject.matrix);

      if (point && heatmapEnabled) {
        tempColor.setRGB(point.rgb[0], point.rgb[1], point.rgb[2]);
        pointsMesh.setColorAt(index, tempColor);
      }
    }

    const alphas = new Float32Array(Math.max(1, normalizedDots.length));
    for (let index = 0; index < normalizedDots.length; index += 1) {
      alphas[index] = heatmapEnabled ? (pointVisuals[index]?.alpha ?? 0.2) : 0;
    }
    const geometry = pointsMesh.geometry as BufferGeometry;
    geometry.setAttribute("instanceAlpha", new InstancedBufferAttribute(alphas, 1));

    if (pointsMesh.instanceColor) {
      pointsMesh.instanceColor.needsUpdate = true;
    }
    pointsMesh.instanceMatrix.needsUpdate = true;
  }, [heatmapEnabled, normalizedDots, pointVisuals, tempColor, tempObject]);

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
    const pointsMesh = pointsRef.current;

    if (!edgePositions || !edgeGeometry || graph.dots.length === 0) {
      return;
    }

    const shouldReinitialize = (justStarted && frameIndex === 0) || !runtimeStepperRef.current;
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

    if (pointsMesh) {
      pointsMesh.count = normalizedDots.length;
      for (let index = 0; index < normalizedDots.length; index += 1) {
        const dot = normalizedDots[index];
        tempObject.position.set(
          dot.x,
          dot.fixed ? 0 : (runtimeState.u[index] ?? 0) * amplitudeScale,
          dot.z,
        );
        tempObject.scale.setScalar(POINT_RADIUS);
        tempObject.updateMatrix();
        pointsMesh.setMatrixAt(index, tempObject.matrix);
      }
      pointsMesh.instanceMatrix.needsUpdate = true;
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
      <instancedMesh
        ref={pointsRef}
        args={[pointGeometry, pointMaterial, Math.max(1, normalizedDots.length)]}
      />
    </group>
  );
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
