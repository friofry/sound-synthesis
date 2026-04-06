import { useMemo, useRef, type MouseEvent } from "react";
import { countDies, isDies } from "../../engine/types";
import { getLabelByNoteIndex } from "./KeyboardMapping";

type PianoKeyboardProps = {
  noteCount: number;
  width?: number;
  height?: number;
  pressedKeys: Set<number>;
  onPressKey: (index: number) => void;
  onReleaseKey: (index: number, immediate: boolean) => void;
};

type KeyRect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dies: boolean;
};

function contains(rect: KeyRect, x: number, y: number): boolean {
  return x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height;
}

export function PianoKeyboard({
  noteCount,
  width = 1120,
  height = 260,
  pressedKeys,
  onPressKey,
  onReleaseKey,
}: PianoKeyboardProps) {
  const mouseDownRef = useRef(false);
  const activeKeyRef = useRef<number>(-1);
  const labelBandHeight = 26;

  const { whiteKeys, blackKeys } = useMemo(() => {
    const keyAreaY = labelBandHeight;
    const keyAreaHeight = height - labelBandHeight;
    const whiteKeyCount = noteCount - countDies(noteCount);
    const widthN = width / whiteKeyCount;
    const heightN = keyAreaHeight;
    const heightD = keyAreaHeight * 0.6;
    const widthD = widthN * 0.3;

    const whites: KeyRect[] = [];
    const blacks: KeyRect[] = [];

    let whiteX = 0;
    for (let i = 0; i < noteCount; i += 1) {
      if (isDies(i)) {
        continue;
      }
      whites.push({
        index: i,
        x: whiteX,
        y: keyAreaY,
        width: widthN,
        height: heightN,
        dies: false,
      });
      whiteX += widthN;
    }

    let blackX = widthN - widthD / 2;
    for (let i = 0; i < noteCount; i += 1) {
      if (!isDies(i)) {
        continue;
      }
      blacks.push({
        index: i,
        x: blackX,
        y: keyAreaY,
        width: widthD,
        height: heightD,
        dies: true,
      });
      blackX += widthN;
      if (i < noteCount - 2 && !isDies(i + 2)) {
        blackX += widthN;
      }
    }

    return { whiteKeys: whites, blackKeys: blacks };
  }, [height, labelBandHeight, noteCount, width]);

  const hitTest = (x: number, y: number): number => {
    for (const key of blackKeys) {
      if (y < key.y + key.height && contains(key, x, y)) {
        return key.index;
      }
    }
    for (const key of whiteKeys) {
      if (contains(key, x, y)) {
        return key.index;
      }
    }
    return -1;
  };

  const getLocalPoint = (event: MouseEvent<SVGSVGElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  };

  const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    mouseDownRef.current = true;
    const point = getLocalPoint(event);
    const index = hitTest(point.x, point.y);
    activeKeyRef.current = index;
    if (index >= 0) {
      onPressKey(index);
    }
  };

  const handleMouseUp = () => {
    mouseDownRef.current = false;
    if (activeKeyRef.current >= 0) {
      onReleaseKey(activeKeyRef.current, false);
    }
    activeKeyRef.current = -1;
  };

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!mouseDownRef.current) {
      return;
    }
    const point = getLocalPoint(event);
    const next = hitTest(point.x, point.y);
    if (next === activeKeyRef.current) {
      return;
    }

    if (activeKeyRef.current >= 0) {
      onReleaseKey(activeKeyRef.current, false);
    }
    activeKeyRef.current = next;
    if (next >= 0) {
      onPressKey(next);
    }
  };

  const handleMouseLeave = () => {
    if (!mouseDownRef.current) {
      return;
    }
    if (activeKeyRef.current >= 0) {
      onReleaseKey(activeKeyRef.current, false);
    }
    activeKeyRef.current = -1;
    mouseDownRef.current = false;
  };

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "block",
        border: "1px solid #000",
        background: "#ffffff",
        userSelect: "none",
        touchAction: "none",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <rect x={0} y={0} width={width} height={labelBandHeight} fill="#f7f7f7" stroke="#000" strokeWidth={1} />

      {whiteKeys.map((key) => (
        <g key={`w-${key.index}`}>
          <line x1={key.x} y1={0} x2={key.x} y2={labelBandHeight} stroke="#000" strokeWidth={1} />
          <rect
            x={key.x}
            y={key.y}
            width={key.width}
            height={key.height}
            fill={pressedKeys.has(key.index) ? "#ffff64" : "#ffffff"}
            stroke="#000"
            strokeWidth={2}
          />
          <text
            x={key.x + key.width / 2}
            y={17}
            fill="#000"
            textAnchor="middle"
            fontSize={16}
            fontFamily="Tahoma, Segoe UI, sans-serif"
            fontWeight={700}
          >
            {getLabelByNoteIndex(key.index)}
          </text>
        </g>
      ))}

      {blackKeys.map((key) => (
        <g key={`b-${key.index}`}>
          <rect
            x={key.x}
            y={key.y}
            width={key.width}
            height={key.height}
            fill={pressedKeys.has(key.index) ? "#c89640" : "#000000"}
            stroke="#000"
            strokeWidth={2}
          />
          <text
            x={key.x + key.width / 2}
            y={17}
            fill="#fff"
            textAnchor="middle"
            fontSize={12}
            fontFamily="Tahoma, Segoe UI, sans-serif"
            fontWeight={700}
          >
            {getLabelByNoteIndex(key.index)}
          </text>
        </g>
      ))}
      <line x1={width} y1={0} x2={width} y2={labelBandHeight} stroke="#000" strokeWidth={1} />
    </svg>
  );
}
