import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Color,
  DataTexture,
  FloatType,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
} from "three";
import { projectDecibelSpectrumToLogBands } from "../../engine/audioSpectrum";

const BAR_COUNT = 48;
const MIN_FREQ = 30;
const MAX_FREQ = 5000;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uSpectrum;
uniform float uTime;
uniform float uBarCount;
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
uniform float uGlow;

varying vec2 vUv;

vec3 palette(float t) {
  if (t < 0.5) {
    return mix(uColorLow, uColorMid, t * 2.0);
  }
  return mix(uColorMid, uColorHigh, (t - 0.5) * 2.0);
}

void main() {
  float barIndex = floor(vUv.x * uBarCount);
  float barFrac = fract(vUv.x * uBarCount);

  float texU = (barIndex + 0.5) / uBarCount;
  float amplitude = texture2D(uSpectrum, vec2(texU, 0.5)).r;

  amplitude = pow(amplitude, 0.7);

  float barGap = smoothstep(0.0, 0.08, barFrac) * smoothstep(1.0, 0.92, barFrac);

  float barHeight = amplitude;
  float y = vUv.y;

  float inBar = step(y, barHeight) * barGap;

  float segCount = 24.0;
  float segFrac = fract(y * segCount);
  float segGap = smoothstep(0.0, 0.12, segFrac) * smoothstep(1.0, 0.88, segFrac);
  inBar *= segGap;

  vec3 barColor = palette(y);

  float shimmer = 0.92 + 0.08 * sin(uTime * 3.0 + barIndex * 0.4);
  barColor *= shimmer;

  float topGlow = smoothstep(barHeight - 0.08, barHeight, y) * step(y, barHeight + 0.01);
  barColor += vec3(1.0) * topGlow * uGlow * 0.5;

  float peakY = max(0.0, barHeight - 0.005);
  float peakBand = smoothstep(peakY - 0.015, peakY, y) * smoothstep(peakY + 0.015, peakY, y);
  barColor += palette(peakY) * peakBand * 1.5 * barGap;

  float edgeFade = smoothstep(0.0, 0.02, vUv.x) * smoothstep(1.0, 0.98, vUv.x);
  float bottomFade = smoothstep(0.0, 0.01, vUv.y);
  inBar *= edgeFade * bottomFade;

  vec3 bgColor = vec3(0.0);
  float bgPulse = amplitude * 0.04 * barGap;
  bgColor += palette(texU) * bgPulse;

  vec3 finalColor = mix(bgColor, barColor, inBar);

  gl_FragColor = vec4(finalColor, max(inBar * 0.95, length(bgColor) * 0.6));
}
`;

type WallEqualizerProps = {
  analyser: AnalyserNode | null;
  position: [number, number, number];
  rotation?: [number, number, number];
  width: number;
  height: number;
  colorScheme?: "warm" | "cool" | "neon" | "purple";
};

const COLOR_SCHEMES: Record<string, { low: string; mid: string; high: string }> = {
  warm: { low: "#ff2060", mid: "#ff8800", high: "#ffee00" },
  cool: { low: "#0044ff", mid: "#00ccff", high: "#00ff88" },
  neon: { low: "#ff00ff", mid: "#00ffff", high: "#ffff00" },
  purple: { low: "#4400cc", mid: "#cc00ff", high: "#ff66ff" },
};

export function WallEqualizer({
  analyser,
  position,
  rotation = [0, 0, 0],
  width,
  height,
  colorScheme = "neon",
}: WallEqualizerProps) {
  const matRef = useRef<ShaderMaterial>(null);
  const dataRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const smoothedRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const floatBufRef = useRef<Float32Array | null>(null);

  const { geometry, material } = useMemo(() => {
    const geo = new PlaneGeometry(width, height);

    const texData = new Float32Array(BAR_COUNT);
    const tex = new DataTexture(texData, BAR_COUNT, 1, RedFormat, FloatType);
    tex.needsUpdate = true;

    const colors = COLOR_SCHEMES[colorScheme] ?? COLOR_SCHEMES.neon;

    const mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSpectrum: { value: tex },
        uTime: { value: 0 },
        uBarCount: { value: BAR_COUNT },
        uColorLow: { value: new Color(colors.low) },
        uColorMid: { value: new Color(colors.mid) },
        uColorHigh: { value: new Color(colors.high) },
        uGlow: { value: 0.8 },
      },
      transparent: true,
      depthWrite: false,
    });

    return { geometry: geo, material: mat };
  }, [width, height, colorScheme]);

  useFrame(({ clock }) => {
    if (!matRef.current) return;

    const t = clock.getElapsedTime();
    matRef.current.uniforms.uTime.value = t;

    const data = dataRef.current;
    const smoothed = smoothedRef.current;

    if (analyser) {
      if (!floatBufRef.current || floatBufRef.current.length !== analyser.frequencyBinCount) {
        floatBufRef.current = new Float32Array(analyser.frequencyBinCount);
      }
      analyser.getFloatFrequencyData(floatBufRef.current);

      data.set(projectDecibelSpectrumToLogBands(floatBufRef.current, analyser.context.sampleRate, {
        barCount: BAR_COUNT,
        minFrequency: MIN_FREQ,
        maxFrequency: MAX_FREQ,
        minDecibels: analyser.minDecibels,
        maxDecibels: analyser.maxDecibels,
      }));
    } else {
      data.fill(0);
    }

    const smoothing = 0.82;
    const decay = 0.94;
    for (let i = 0; i < BAR_COUNT; i++) {
      if (data[i] > smoothed[i]) {
        smoothed[i] = smoothed[i] * (1 - smoothing) + data[i] * smoothing;
      } else {
        smoothed[i] *= decay;
        if (smoothed[i] < 0.001) smoothed[i] = 0;
      }
    }

    const spectrumTexture = matRef.current.uniforms.uSpectrum.value as DataTexture;
    const texData = spectrumTexture.image.data as Float32Array;
    texData.set(smoothed);
    spectrumTexture.needsUpdate = true;
  });

  return (
    <mesh position={position} rotation={rotation} geometry={geometry} material={material}>
      <primitive object={material} ref={matRef} />
    </mesh>
  );
}
