import type { FloatArray } from "./types";

export function applyQuadraticDamping(acceleration: FloatArray, velocity: FloatArray, squareAttenuation: number): void {
  for (let i = 0; i < velocity.length; i += 1) {
    acceleration[i] -= squareAttenuation * Math.abs(velocity[i]) * velocity[i];
  }
}

export function applyVelocityDamping(
  acceleration: FloatArray,
  velocity: FloatArray,
  attenuation: number,
  squareAttenuation: number,
): void {
  for (let i = 0; i < velocity.length; i += 1) {
    acceleration[i] -= attenuation * velocity[i];
  }
  applyQuadraticDamping(acceleration, velocity, squareAttenuation);
}
