import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { Vector3 } from "three";
import { MembraneMesh } from "./MembraneMesh";
import { useGraphStore } from "../../store/graphStore";

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

export function MembraneViewer() {
  const graph = useGraphStore((state) => state.graph);
  const updateGraph = useGraphStore((state) => state.updateGraph);

  const normalizedDots = useMemo(() => {
    const bounds = computeBounds(graph.dots);
    return graph.dots.map((dot, index) => ({
      index,
      x: ((dot.x - bounds.minX) / bounds.width) * 4 - 2,
      z: ((dot.y - bounds.minY) / bounds.height) * 2 - 1,
      fixed: dot.fixed,
    }));
  }, [graph.dots]);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const click = event.point.clone();

    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const dot of normalizedDots) {
      if (dot.fixed) {
        continue;
      }

      const candidate = new Vector3(dot.x, 0, dot.z);
      const distance = candidate.distanceTo(click);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = dot.index;
      }
    }

    if (nearestIndex === -1) {
      return;
    }

    const amount = event.button === 2 ? -1 : 1;
    updateGraph((next) => {
      const dot = next.dots[nearestIndex];
      if (!dot || dot.fixed) {
        return;
      }
      next.setDotProps(nearestIndex, { u: dot.u + amount * 0.5 });
    });
  };

  return (
    <div className="viewer-canvas-wrap">
      <Canvas
        camera={{ position: [0, 2.5, 5.5], fov: 50 }}
        onCreated={({ gl }) => {
          gl.setClearColor("#020202");
          gl.domElement.oncontextmenu = (e) => e.preventDefault();
        }}
      >
        <group onPointerDown={onPointerDown}>
          <MembraneMesh />
        </group>
        <OrbitControls enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
