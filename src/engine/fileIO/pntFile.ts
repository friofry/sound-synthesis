import type { Connection, PntData, Point2D, WaveFormat } from "./types";

const MAGIC = "PNTF";
const INT32_SIZE = 4;
const INT16_SIZE = 2;

export const WAVEFORMATEX_SIZE = 18;

function ensureInt32(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
}

function writeWaveFormat(view: DataView, offset: number, format: WaveFormat): number {
  view.setUint16(offset, format.formatTag, true);
  offset += 2;
  view.setUint16(offset, format.channels, true);
  offset += 2;
  view.setUint32(offset, format.samplesPerSec, true);
  offset += 4;
  view.setUint32(offset, format.avgBytesPerSec, true);
  offset += 4;
  view.setUint16(offset, format.blockAlign, true);
  offset += 2;
  view.setUint16(offset, format.bitsPerSample, true);
  offset += 2;
  view.setUint16(offset, format.cbSize, true);
  offset += 2;
  return offset;
}

function readWaveFormat(view: DataView, offset: number): { format: WaveFormat; offset: number } {
  const format: WaveFormat = {
    formatTag: view.getUint16(offset, true),
    channels: view.getUint16(offset + 2, true),
    samplesPerSec: view.getUint32(offset + 4, true),
    avgBytesPerSec: view.getUint32(offset + 8, true),
    blockAlign: view.getUint16(offset + 12, true),
    bitsPerSample: view.getUint16(offset + 14, true),
    cbSize: view.getUint16(offset + 16, true),
  };
  return { format, offset: offset + WAVEFORMATEX_SIZE };
}

function writeConnections(view: DataView, offset: number, connections: Connection[]): number {
  view.setInt32(offset, connections.length, true);
  offset += INT32_SIZE;
  for (const connection of connections) {
    view.setInt32(offset, connection.i, true);
    offset += INT32_SIZE;
    view.setInt32(offset, connection.j, true);
    offset += INT32_SIZE;
  }
  return offset;
}

function readConnections(view: DataView, offset: number): { connections: Connection[]; offset: number } {
  const nConn = view.getInt32(offset, true);
  offset += INT32_SIZE;
  if (nConn < 0) {
    throw new Error("Invalid PNTF connection count");
  }
  const connections: Connection[] = [];
  for (let i = 0; i < nConn; i += 1) {
    connections.push({
      i: view.getInt32(offset, true),
      j: view.getInt32(offset + INT32_SIZE, true),
    });
    offset += INT32_SIZE * 2;
  }
  return { connections, offset };
}

function writePoints(view: DataView, offset: number, points: Point2D[]): number {
  for (const point of points) {
    view.setInt32(offset, point.x, true);
    offset += INT32_SIZE;
    view.setInt32(offset, point.y, true);
    offset += INT32_SIZE;
  }
  return offset;
}

function readPoints(view: DataView, offset: number, count: number): { points: Point2D[]; offset: number } {
  const points: Point2D[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push({
      x: view.getInt32(offset, true),
      y: view.getInt32(offset + INT32_SIZE, true),
    });
    offset += INT32_SIZE * 2;
  }
  return { points, offset };
}

function writePayload(
  view: DataView,
  offset: number,
  buffers: Int16Array[],
  bufferLength: number,
  quantityBuffer: number,
  channels: number,
): number {
  for (let sampleIndex = 0; sampleIndex < bufferLength; sampleIndex += channels) {
    for (let bufferIndex = 0; bufferIndex < quantityBuffer; bufferIndex += 1) {
      const source = buffers[bufferIndex];
      for (let ch = 0; ch < channels; ch += 1) {
        view.setInt16(offset, source[sampleIndex + ch], true);
        offset += INT16_SIZE;
      }
    }
  }
  return offset;
}

function readPayload(
  view: DataView,
  offset: number,
  bufferLength: number,
  quantityBuffer: number,
  channels: number,
): { buffers: Int16Array[]; offset: number } {
  const buffers = Array.from({ length: quantityBuffer }, () => new Int16Array(bufferLength));

  for (let sampleIndex = 0; sampleIndex < bufferLength; sampleIndex += channels) {
    for (let bufferIndex = 0; bufferIndex < quantityBuffer; bufferIndex += 1) {
      const target = buffers[bufferIndex];
      for (let ch = 0; ch < channels; ch += 1) {
        target[sampleIndex + ch] = view.getInt16(offset, true);
        offset += INT16_SIZE;
      }
    }
  }

  return { buffers, offset };
}

export function pntToBuffer(data: PntData): ArrayBuffer {
  const {
    format,
    vertexCount,
    connections,
    fixedIndices,
    bufferLength,
    quantityBuffer,
    points,
  } = data.header;
  const { buffers } = data;

  ensureInt32(vertexCount, "vertexCount");
  ensureInt32(bufferLength, "bufferLength");
  ensureInt32(quantityBuffer, "quantityBuffer");

  if (format.bitsPerSample !== 16) {
    throw new Error("Only 16-bit PCM PNTF is currently supported");
  }
  if (format.channels <= 0) {
    throw new Error("channels must be greater than 0");
  }
  if (bufferLength % format.channels !== 0) {
    throw new Error("bufferLength must be divisible by channels");
  }
  if (points.length !== vertexCount) {
    throw new Error("points length must match vertexCount");
  }
  if (buffers.length !== quantityBuffer) {
    throw new Error("buffers length must match quantityBuffer");
  }
  for (let i = 0; i < buffers.length; i += 1) {
    if (buffers[i].length !== bufferLength) {
      throw new Error(`Buffer at index ${i} has invalid length`);
    }
  }

  const headerBytes =
    4 +
    WAVEFORMATEX_SIZE +
    INT32_SIZE +
    INT32_SIZE +
    connections.length * 8 +
    INT32_SIZE +
    fixedIndices.length * INT32_SIZE +
    INT32_SIZE +
    INT32_SIZE +
    points.length * 8;

  const payloadBytes = bufferLength * quantityBuffer * INT16_SIZE;
  const buffer = new ArrayBuffer(headerBytes + payloadBytes);
  const view = new DataView(buffer);

  let offset = 0;
  for (let i = 0; i < MAGIC.length; i += 1) {
    view.setUint8(offset + i, MAGIC.charCodeAt(i));
  }
  offset += 4;

  offset = writeWaveFormat(view, offset, format);
  view.setInt32(offset, vertexCount, true);
  offset += INT32_SIZE;

  offset = writeConnections(view, offset, connections);

  view.setInt32(offset, fixedIndices.length, true);
  offset += INT32_SIZE;
  for (const fixedIndex of fixedIndices) {
    view.setInt32(offset, fixedIndex, true);
    offset += INT32_SIZE;
  }

  view.setInt32(offset, bufferLength, true);
  offset += INT32_SIZE;
  view.setInt32(offset, quantityBuffer, true);
  offset += INT32_SIZE;

  offset = writePoints(view, offset, points);
  writePayload(view, offset, buffers, bufferLength, quantityBuffer, format.channels);

  return buffer;
}

export function pntFromBuffer(buffer: ArrayBuffer): PntData {
  const view = new DataView(buffer);
  let offset = 0;

  const ensure = (count: number): void => {
    if (offset + count > buffer.byteLength) {
      throw new Error("Unexpected end of PNTF buffer");
    }
  };

  ensure(4);
  const magic = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
  offset += 4;
  if (magic !== MAGIC) {
    throw new Error("Invalid PNTF magic");
  }

  ensure(WAVEFORMATEX_SIZE);
  const waveRead = readWaveFormat(view, offset);
  const format = waveRead.format;
  offset = waveRead.offset;

  if (format.bitsPerSample !== 16) {
    throw new Error("Only 16-bit PCM PNTF is currently supported");
  }
  if (format.channels <= 0) {
    throw new Error("Invalid channels in PNTF format");
  }

  ensure(INT32_SIZE);
  const vertexCount = view.getInt32(offset, true);
  offset += INT32_SIZE;
  if (vertexCount < 0) {
    throw new Error("Invalid vertexCount");
  }

  ensure(INT32_SIZE);
  const connRead = readConnections(view, offset);
  const connections = connRead.connections;
  offset = connRead.offset;

  ensure(INT32_SIZE);
  const fixedCount = view.getInt32(offset, true);
  offset += INT32_SIZE;
  if (fixedCount < 0) {
    throw new Error("Invalid fixed index count");
  }
  ensure(fixedCount * INT32_SIZE);
  const fixedIndices: number[] = [];
  for (let i = 0; i < fixedCount; i += 1) {
    fixedIndices.push(view.getInt32(offset, true));
    offset += INT32_SIZE;
  }

  ensure(INT32_SIZE * 2);
  const bufferLength = view.getInt32(offset, true);
  offset += INT32_SIZE;
  const quantityBuffer = view.getInt32(offset, true);
  offset += INT32_SIZE;
  if (bufferLength < 0 || quantityBuffer < 0) {
    throw new Error("Invalid PNTF buffer dimensions");
  }
  if (bufferLength % format.channels !== 0) {
    throw new Error("bufferLength must be divisible by channels");
  }

  ensure(vertexCount * 8);
  const pointsRead = readPoints(view, offset, vertexCount);
  const points = pointsRead.points;
  offset = pointsRead.offset;

  const expectedPayload = bufferLength * quantityBuffer * INT16_SIZE;
  ensure(expectedPayload);
  const payloadRead = readPayload(view, offset, bufferLength, quantityBuffer, format.channels);
  const buffers = payloadRead.buffers;
  offset = payloadRead.offset;

  if (offset !== buffer.byteLength) {
    throw new Error("Unexpected trailing bytes in PNTF buffer");
  }

  return {
    header: {
      format,
      vertexCount,
      connections,
      fixedIndices,
      bufferLength,
      quantityBuffer,
      points,
    },
    buffers,
  };
}
