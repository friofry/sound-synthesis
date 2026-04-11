import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Group,
  type PointLight,
} from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useAudioAnalyserStore } from "../../store/audioAnalyserStore";
import { WallEqualizer } from "./WallEqualizer";

type Point2D = { x: number; z: number };

type HeatmapSceneShellProps = {
  enabled: boolean;
  membraneDots: Point2D[];
};

const ROOM_W = 10;
const ROOM_H = 5;
const ROOM_D = 8;

const TABLE_TOP_H = 0.12;
const TABLE_Y = -0.12;
const LEG_H = 1.1;
const LEG_RADIUS = 0.07;

const FRAME_H = 0.06;
const FRAME_OFFSET = 0.05;

const DISCO_Y = 2.8;
const DISCO_RADIUS = 0.35;
const DISCO_RAY_COUNT = 8;
const DISCO_RAY_COLORS = [
  "#ff3090", "#30ff90", "#3090ff", "#ffff30",
  "#ff9030", "#90ff30", "#ff30ff", "#30ffff",
];

export function HeatmapSceneShell({ enabled, membraneDots }: HeatmapSceneShellProps) {
  const accentRef = useRef<PointLight>(null);
  const analyser = useAudioAnalyserStore((s) => s.analyser);

  useFrame(({ clock }) => {
    if (!accentRef.current) {
      return;
    }
    const t = clock.getElapsedTime();
    accentRef.current.position.set(
      Math.sin(t * 0.5) * 2.5,
      2.2 + Math.sin(t * 1.1) * 0.3,
      Math.cos(t * 0.65) * 1.8,
    );
  });

  const hull = useMemo(() => {
    if (membraneDots.length < 3) {
      return computeConvexHull(membraneDots);
    }
    const raw = computeConvexHull(membraneDots);
    const cx = raw.reduce((s, p) => s + p.x, 0) / raw.length;
    const cz = raw.reduce((s, p) => s + p.z, 0) / raw.length;
    return raw.map((p) => ({
      x: cx + (p.x - cx) * 1.08,
      z: cz + (p.z - cz) * 1.08,
    }));
  }, [membraneDots]);

  const expandedHull = useMemo(
    () => offsetPolygon(hull, FRAME_OFFSET),
    [hull],
  );

  const legPositions = useMemo(() => pickLegCorners(expandedHull), [expandedHull]);

  if (!enabled) {
    return null;
  }

  const floorY = TABLE_Y - TABLE_TOP_H / 2 - LEG_H;
  const frameY = TABLE_Y + TABLE_TOP_H / 2 + 0.04;
  const legCenterY = frameY - LEG_H / 2;

  return (
    <group>
      {/* ── Lighting ── */}
      <ambientLight intensity={0.6} color="#c8cfe6" />
      <directionalLight position={[3, 4.5, 2]} intensity={1.4} color="#fff5ea" />
      <directionalLight position={[-3, 3, -2]} intensity={0.5} color="#d0dfff" />

      <pointLight position={[-4, 3.8, -3]} intensity={2.5} distance={14} color="#ffe8cc" />
      <pointLight position={[4, 3.8, -3]} intensity={2.5} distance={14} color="#ffe8cc" />
      <pointLight position={[-4, 3.8, 3]} intensity={1.8} distance={14} color="#dde8ff" />
      <pointLight position={[4, 3.8, 3]} intensity={1.8} distance={14} color="#dde8ff" />

      <pointLight
        ref={accentRef}
        position={[0, 2.2, 1.5]}
        intensity={1.5}
        distance={9}
        color="#e0d6ff"
      />

      {/* ── Room ── */}
      <mesh position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#3a3540" roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh position={[0, floorY + ROOM_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#2e2a35" roughness={0.9} metalness={0.02} />
      </mesh>
      <mesh position={[0, floorY + ROOM_H / 2, -ROOM_D / 2]}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial color="#35303e" roughness={0.8} metalness={0.06} />
      </mesh>
      <mesh position={[-ROOM_W / 2, floorY + ROOM_H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        <meshStandardMaterial color="#383245" roughness={0.82} metalness={0.06} />
      </mesh>
      <mesh position={[ROOM_W / 2, floorY + ROOM_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        <meshStandardMaterial color="#383245" roughness={0.82} metalness={0.06} />
      </mesh>
      <mesh position={[0, floorY + ROOM_H / 2, ROOM_D / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial color="#302c38" roughness={0.85} metalness={0.04} />
      </mesh>

      {/* ── Wall equalizers ── */}
      <WallEqualizer
        analyser={analyser}
        position={[0, floorY + ROOM_H / 2, -ROOM_D / 2 + 0.01]}
        width={ROOM_W * 0.92}
        height={ROOM_H * 0.85}
        colorScheme="neon"
      />
      <WallEqualizer
        analyser={analyser}
        position={[-ROOM_W / 2 + 0.01, floorY + ROOM_H / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={ROOM_D * 0.92}
        height={ROOM_H * 0.85}
        colorScheme="warm"
      />
      <WallEqualizer
        analyser={analyser}
        position={[ROOM_W / 2 - 0.01, floorY + ROOM_H / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={ROOM_D * 0.92}
        height={ROOM_H * 0.85}
        colorScheme="cool"
      />
      <WallEqualizer
        analyser={analyser}
        position={[0, floorY + ROOM_H / 2, ROOM_D / 2 - 0.01]}
        rotation={[0, Math.PI, 0]}
        width={ROOM_W * 0.92}
        height={ROOM_H * 0.85}
        colorScheme="purple"
      />

      {/* ── Ornate legs ── */}
      {legPositions.map((pos, i) => (
        <OrnamentedLeg key={i} position={[pos.x, legCenterY, pos.z]} height={LEG_H} />
      ))}

      {/* ── Membrane perimeter frame ── */}
      <PerimeterFrame hull={expandedHull} y={frameY} />

      {/* ── Disco ball ── */}
      <DiscoBall />
    </group>
  );
}

/* ── Perimeter frame built from convex hull segments ── */

function PerimeterFrame({ hull, y }: { hull: Point2D[]; y: number }) {
  const segments = useMemo(() => {
    if (hull.length < 3) {
      return [];
    }

    const barWidth = 0.1;
    const result: { px: number; pz: number; length: number; angle: number }[] = [];

    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 1e-6) continue;

      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const angle = Math.atan2(dx, dz);

      result.push({ px: mx, pz: mz, length: length + barWidth, angle });
    }

    return result;
  }, [hull]);

  return (
    <group position={[0, y, 0]}>
      {segments.map((seg, i) => (
        <mesh key={i} position={[seg.px, 0, seg.pz]} rotation={[0, seg.angle, 0]}>
          <boxGeometry args={[0.1, FRAME_H, seg.length]} />
          <meshStandardMaterial color="#5a5068" roughness={0.38} metalness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Ornate turned leg ── */

function DiscoBall() {
  const groupRef = useRef<Group>(null);
  const raysRef = useRef<Group>(null);

  const { mirrorsMesh, innerMesh } = useMemo(() => buildDiscoBall(DISCO_RADIUS, 0.04), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.6;
      groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.1;
    }
    if (raysRef.current) {
      raysRef.current.rotation.y = -t * 0.4;
    }
  });

  return (
    <group position={[0, DISCO_Y, 0]}>
      {/* suspension wire */}
      <mesh position={[0, (TABLE_Y - TABLE_TOP_H / 2 - LEG_H + ROOM_H - DISCO_Y + DISCO_RADIUS) / 2 + DISCO_RADIUS, 0]}>
        <cylinderGeometry args={[0.012, 0.012, TABLE_Y - TABLE_TOP_H / 2 - LEG_H + ROOM_H - DISCO_Y + DISCO_RADIUS, 8]} />
        <meshStandardMaterial color="#888" roughness={0.3} metalness={0.8} />
      </mesh>

      <group ref={groupRef}>
        <primitive object={innerMesh} />
        <primitive object={mirrorsMesh} />
      </group>

      <pointLight intensity={3} distance={10} color="#f8f0ff" decay={2} />

      <group ref={raysRef}>
        {DISCO_RAY_COLORS.map((color, i) => {
          const angle = (i / DISCO_RAY_COUNT) * Math.PI * 2;
          const elevation = ((i % 3) - 1) * 0.35;
          return (
            <pointLight
              key={i}
              position={[
                Math.cos(angle) * 1.2,
                elevation,
                Math.sin(angle) * 1.2,
              ]}
              intensity={1.5}
              distance={8}
              color={color}
              decay={2}
            />
          );
        })}
      </group>
    </group>
  );
}

function buildDiscoBall(radius: number, mirrorSize: number) {
  const dummy = new Object3D();

  const rawGeom = new IcosahedronGeometry(radius, 5);
  rawGeom.deleteAttribute("normal");
  rawGeom.deleteAttribute("uv");
  const baseGeom: BufferGeometry = BufferGeometryUtils.mergeVertices(rawGeom);
  baseGeom.computeVertexNormals();

  const positions = baseGeom.attributes.position.array;
  const normals = baseGeom.attributes.normal.array;
  const vertexCount = baseGeom.attributes.position.count;

  const mirrorGeom = new PlaneGeometry(mirrorSize, mirrorSize);
  const mirrorMat = new MeshStandardMaterial({
    color: "#e0e0e0",
    roughness: 0.05,
    metalness: 1.0,
  });

  const instancedMirrors = new InstancedMesh(mirrorGeom, mirrorMat, vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    dummy.position.set(positions[idx], positions[idx + 1], positions[idx + 2]);
    dummy.lookAt(
      positions[idx] + normals[idx],
      positions[idx + 1] + normals[idx + 1],
      positions[idx + 2] + normals[idx + 2],
    );
    dummy.updateMatrix();
    instancedMirrors.setMatrixAt(i, dummy.matrix);
  }

  const innerGeom = new SphereGeometry(radius * 0.97, 32, 24);
  const innerMat = new MeshBasicMaterial({ color: 0x222222 });
  const innerMesh = new Mesh(innerGeom, innerMat);

  return { mirrorsMesh: instancedMirrors, innerMesh };
}

/* ── Ornate turned leg ── */

function OrnamentedLeg({
  position,
  height,
}: {
  position: [number, number, number];
  height: number;
}) {
  const geometry = useMemo(() => new CylinderGeometry(LEG_RADIUS, LEG_RADIUS, height, 24, 64), [height]);

  const material = useMemo(() => {
    const mat = new MeshStandardMaterial({
      color: "#58506a",
      roughness: 0.35,
      metalness: 0.55,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.legHeight = { value: height };

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
uniform float legHeight;
varying float vNY;`,
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>

float ny = (position.y / legHeight) + 0.5;
vNY = ny;

float bulge1 = sin(ny * 3.14159 * 2.0) * 0.35;
float bulge2 = sin(ny * 3.14159 * 5.0) * 0.18;
float bulge3 = sin(ny * 3.14159 * 9.0) * 0.08;

float taper = 1.0 - 0.25 * pow(abs(ny - 0.5) * 2.0, 2.0);

float profile = taper + bulge1 * 0.3 + bulge2 * 0.25 + bulge3 * 0.15;
profile = max(profile, 0.35);

float topBulb = smoothstep(0.88, 1.0, ny) * 0.6;
float bottomBulb = smoothstep(0.12, 0.0, ny) * 0.5;
profile += topBulb + bottomBulb;

transformed.x *= profile;
transformed.z *= profile;`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
varying float vNY;`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float groove = abs(sin(vNY * 3.14159 * 9.0));
roughnessFactor = mix(0.22, 0.55, groove);`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
metalnessFactor = mix(0.65, 0.35, groove);`,
      );
    };

    mat.customProgramCacheKey = () => "ornate-leg-v2";
    return mat;
  }, [height]);

  return <mesh position={position} geometry={geometry} material={material} />;
}

/* ── Convex hull (Andrew's monotone chain) ── */

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length < 3) {
    return points.slice();
  }

  const sorted = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function offsetPolygon(polygon: Point2D[], distance: number): Point2D[] {
  if (polygon.length < 3) {
    return polygon;
  }

  const n = polygon.length;
  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    let nx = -(next.z - prev.z);
    let nz = next.x - prev.x;
    const len = Math.sqrt(nx * nx + nz * nz) || 1;
    nx /= len;
    nz /= len;

    result.push({ x: curr.x + nx * distance, z: curr.z + nz * distance });
  }

  return result;
}

function pickLegCorners(hull: Point2D[]): Point2D[] {
  const n = hull.length;
  if (n < 4) {
    return hull.slice();
  }

  const cx = hull.reduce((s, p) => s + p.x, 0) / n;
  const cz = hull.reduce((s, p) => s + p.z, 0) / n;

  const withAngle = hull.map((p) => ({
    ...p,
    angle: Math.atan2(p.z - cz, p.x - cx),
  }));
  withAngle.sort((a, b) => a.angle - b.angle);

  const legCount = Math.min(n, 6);
  if (legCount >= n) {
    return withAngle;
  }

  return selectSpreadVertices(withAngle, legCount);
}

function selectSpreadVertices(
  sorted: (Point2D & { angle: number })[],
  count: number,
): Point2D[] {
  const n = sorted.length;
  if (n <= count) return sorted;

  let bestScore = -Infinity;
  let bestSet: number[] = [];

  for (let start = 0; start < n; start++) {
    const indices = [start];
    const step = n / count;
    for (let k = 1; k < count; k++) {
      const ideal = start + k * step;
      const idx = Math.round(ideal) % n;
      indices.push(idx);
    }

    let minGap = Infinity;
    for (let k = 0; k < indices.length; k++) {
      const a = sorted[indices[k]].angle;
      const b = sorted[indices[(k + 1) % indices.length]].angle;
      let gap = b - a;
      if (gap <= 0) gap += Math.PI * 2;
      if (gap < minGap) minGap = gap;
    }

    if (minGap > bestScore) {
      bestScore = minGap;
      bestSet = indices;
    }
  }

  return bestSet.map((i) => sorted[i]);
}
