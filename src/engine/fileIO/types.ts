export interface Line {
  dot1: number;
  dot2: number;
  k: number;
}

export interface Dot {
  x: number;
  y: number;
  u: number;
  v: number;
  weight: number;
  fixed: boolean;
  inputFile: string | null;
}

export interface SerializedGraph {
  dots: Dot[];
  lines: Line[];
}

export interface WaveFormat {
  formatTag: number;
  channels: number;
  samplesPerSec: number;
  avgBytesPerSec: number;
  blockAlign: number;
  bitsPerSample: number;
  cbSize: number;
}

export interface Connection {
  i: number;
  j: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface PntHeader {
  format: WaveFormat;
  vertexCount: number;
  connections: Connection[];
  fixedIndices: number[];
  bufferLength: number;
  quantityBuffer: number;
  points: Point2D[];
}

export interface PntData {
  header: PntHeader;
  buffers: Int16Array[];
}

export interface InstrumentEntry {
  alias: string;
  key: string;
  wavPath: string;
}
