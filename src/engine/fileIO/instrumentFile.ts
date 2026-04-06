import type { InstrumentEntry } from "./types";

export type InstrumentFetch = (path: string) => Promise<ArrayBuffer>;

export function parseInstrumentFile(text: string): InstrumentEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: InstrumentEntry[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) {
      continue;
    }

    const tokens = raw.split(/\s+/);
    if (tokens.length !== 3) {
      throw new Error(`Malformed .ins line ${i + 1}: expected 3 tokens`);
    }

    const [alias, key, wavPath] = tokens;
    if (key.length !== 1) {
      throw new Error(`Malformed .ins line ${i + 1}: key must be a single character`);
    }

    entries.push({ alias, key, wavPath });
  }

  return entries;
}

export function serializeInstrumentFile(entries: InstrumentEntry[]): string {
  if (!entries.length) {
    return "";
  }

  const lines = entries.map(({ alias, key, wavPath }, index) => {
    if (!alias || !key || !wavPath) {
      throw new Error(`Invalid instrument entry at index ${index}`);
    }
    if (key.length !== 1) {
      throw new Error(`Invalid instrument key at index ${index}`);
    }
    return `${alias} ${key} ${wavPath}`;
  });

  return `${lines.join("\n")}\n`;
}

export async function loadInstrumentWavFiles(
  entries: InstrumentEntry[],
  fetchFn: InstrumentFetch,
): Promise<Map<string, ArrayBuffer>> {
  const byPath = new Map<string, Promise<ArrayBuffer>>();
  const byAlias = new Map<string, ArrayBuffer>();

  for (const entry of entries) {
    const { alias, wavPath } = entry;
    if (!byPath.has(wavPath)) {
      byPath.set(wavPath, fetchFn(wavPath));
    }
    const data = await byPath.get(wavPath);
    if (!data) {
      throw new Error(`Failed to load WAV for alias ${alias}`);
    }
    byAlias.set(alias, data);
  }

  return byAlias;
}
