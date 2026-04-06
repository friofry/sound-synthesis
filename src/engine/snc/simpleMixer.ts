import { MixMode } from "./types";

const INT16_MAX = 32767;
const INT16_MIN = -32768;
const REGULATION_TARGET = 28000;

function clampToInt16(value: number): number {
  if (value > INT16_MAX) {
    return INT16_MAX;
  }
  if (value < INT16_MIN) {
    return INT16_MIN;
  }
  return Math.round(value);
}

export class SimpleMixer {
  private buffer: Float64Array;
  private mode: MixMode;

  public constructor(mode: MixMode = MixMode.Saturation) {
    this.mode = mode;
    this.buffer = new Float64Array(0);
  }

  public get size(): number {
    return this.buffer.length;
  }

  public addBuffer(data: Int16Array, where = 0, mixCoeff = 1): void {
    if (where < 0) {
      throw new Error("where must be >= 0");
    }

    const requiredSize = where + data.length;
    if (requiredSize > this.buffer.length) {
      const next = new Float64Array(requiredSize);
      next.set(this.buffer, 0);
      this.buffer = next;
    }

    for (let i = 0; i < data.length; i += 1) {
      this.buffer[where + i] += data[i] * mixCoeff;
    }
  }

  public appendBuffer(data: Int16Array, mixCoeff = 1): void {
    this.addBuffer(data, this.buffer.length, mixCoeff);
  }

  public clearBuffer(): void {
    this.buffer = new Float64Array(0);
  }

  public cutBuffer(howMany: number): void {
    if (howMany <= 0) {
      return;
    }
    if (howMany >= this.buffer.length) {
      this.clearBuffer();
      return;
    }
    this.buffer = this.buffer.slice(howMany);
  }

  public getBuffer(howMany?: number, startPos = 0): Int16Array {
    if (startPos < 0) {
      throw new Error("startPos must be >= 0");
    }
    if (startPos >= this.buffer.length) {
      return new Int16Array(0);
    }

    const count = howMany === undefined ? this.buffer.length - startPos : howMany;
    if (count <= 0) {
      return new Int16Array(0);
    }

    const endExclusive = Math.min(startPos + count, this.buffer.length);
    const length = endExclusive - startPos;
    const out = new Int16Array(length);

    if (this.mode === MixMode.Regulation) {
      let maxAbs = 0;
      for (let i = startPos; i < endExclusive; i += 1) {
        const absValue = Math.abs(this.buffer[i]);
        if (absValue > maxAbs) {
          maxAbs = absValue;
        }
      }

      if (maxAbs === 0) {
        return out;
      }

      const scale = REGULATION_TARGET / maxAbs;
      for (let i = 0; i < length; i += 1) {
        out[i] = clampToInt16(this.buffer[startPos + i] * scale);
      }
      return out;
    }

    for (let i = 0; i < length; i += 1) {
      out[i] = clampToInt16(this.buffer[startPos + i]);
    }
    return out;
  }
}

export { REGULATION_TARGET };
