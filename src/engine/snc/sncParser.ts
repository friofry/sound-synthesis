import { SimpleMixer } from "./simpleMixer";
import type {
  SncAliasDefinition,
  SncCommand,
  SncExecutionContext,
  SncParseResult,
  SncStream,
} from "./types";

function parseNumber(value: string, lineNo: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} at line ${lineNo}`);
  }
  return parsed;
}

/** Legacy scores use `1G a 0.5 -- comment` — strip from ` --` so the line stays three tokens. */
function stripInlineComment(line: string): string {
  const idx = line.search(/\s--/);
  if (idx === -1) {
    return line;
  }
  return line.slice(0, idx).trimEnd();
}

function parseAliasBlockLine(line: string, lineNo: number): SncAliasDefinition {
  const parts = line.split(/\s+/);
  if (parts.length !== 3) {
    throw new Error(`Invalid alias declaration at line ${lineNo}`);
  }
  return {
    name: parts[0],
    source: parts[1],
    gain: parseNumber(parts[2], lineNo, "alias gain"),
  };
}

function parseCommandLine(line: string, lineNo: number): SncCommand {
  if (line === "!clear") {
    return { type: "clear" };
  }
  if (line.startsWith("!wait ")) {
    const waitValue = line.slice("!wait ".length).trim();
    return { type: "wait", seconds: parseNumber(waitValue, lineNo, "wait duration") };
  }
  /** MIDI export / tooling: `!stop 4E` releases that alias (same as `4E r 0`). */
  if (line.startsWith("!stop ")) {
    const name = line.slice("!stop ".length).trim();
    if (!name.length) {
      throw new Error(`Invalid !stop at line ${lineNo}`);
    }
    return { type: "alias", name, flag: "r", duration: 0 };
  }

  const parts = line.split(/\s+/);
  if (parts.length !== 3) {
    throw new Error(`Incorrect syntax at line ${lineNo}, expected: alias flag duration`);
  }
  const [name, flagToken, durationToken] = parts;
  if (flagToken !== "a" && flagToken !== "r") {
    throw new Error(`Unknown alias flag '${flagToken}' at line ${lineNo}`);
  }
  return {
    type: "alias",
    name,
    flag: flagToken,
    duration: parseNumber(durationToken, lineNo, "alias duration"),
  };
}

export function parseSncText(text: string): SncParseResult {
  const aliases = new Map<string, SncAliasDefinition>();
  const commands: SncCommand[] = [];
  const lines = text.split(/\r?\n/);
  let inAliasBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index];
    const line = stripInlineComment(raw.trim()).trim();

    if (line.length === 0 || line.startsWith("--")) {
      continue;
    }

    if (inAliasBlock) {
      if (line === "!end alias") {
        inAliasBlock = false;
        continue;
      }
      const parsedAlias = parseAliasBlockLine(line, lineNo);
      aliases.set(parsedAlias.name, parsedAlias);
      continue;
    }

    if (line === "!begin alias") {
      inAliasBlock = true;
      continue;
    }
    if (line === "!end alias") {
      throw new Error(`Unexpected !end alias at line ${lineNo}`);
    }

    commands.push(parseCommandLine(line, lineNo));
  }

  if (inAliasBlock) {
    throw new Error("Unclosed !begin alias block");
  }

  return { aliases, commands };
}

const INT16_MAX = 32_767;
const INT16_MIN = -32_768;
const DEFAULT_RELEASE_FADE_MS = 14;

function clampInt16(v: number): number {
  if (v > INT16_MAX) {
    return INT16_MAX;
  }
  if (v < INT16_MIN) {
    return INT16_MIN;
  }
  return Math.round(v);
}

/** Linear ramp from full level to zero — removes step discontinuity when a note is cut. */
function applyLinearFadeOut(samples: Int16Array): Int16Array {
  const n = samples.length;
  if (n === 0) {
    return samples;
  }
  const out = new Int16Array(n);
  const denom = n === 1 ? 1 : n - 1;
  for (let i = 0; i < n; i += 1) {
    const g = 1 - i / denom;
    out[i] = clampInt16(samples[i] * g);
  }
  return out;
}

function mergeResidualFade(residual: Float64Array | null, fade: Int16Array): Float64Array {
  if (fade.length === 0) {
    return residual ?? new Float64Array(0);
  }
  const maxL = Math.max(residual?.length ?? 0, fade.length);
  const out = new Float64Array(maxL);
  if (residual) {
    out.set(residual);
  }
  for (let i = 0; i < fade.length; i += 1) {
    out[i] += fade[i];
  }
  return out;
}

/** Takes the first `take` samples from `residual` as int16, shifts the rest left. */
function takeResidualHead(residual: Float64Array, take: number): { head: Int16Array; rest: Float64Array | null } {
  if (take <= 0) {
    return { head: new Int16Array(0), rest: residual.length > 0 ? residual : null };
  }
  const n = Math.min(take, residual.length);
  const head = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    head[i] = clampInt16(residual[i]);
  }
  if (n >= residual.length) {
    return { head, rest: null };
  }
  return { head, rest: Float64Array.from(residual.subarray(n)) };
}

function getOrCreateStream(
  activeStreams: Map<string, SncStream>,
  alias: string,
  context: SncExecutionContext,
): SncStream {
  let stream = activeStreams.get(alias);
  if (!stream) {
    stream = context.createStreamForAlias(alias);
    activeStreams.set(alias, stream);
  } else {
    /** Re-triggering the same note (`a -1`) must restart the sample; otherwise the PCM offset stays at EOF and the note is silent. */
    stream.reset();
  }
  return stream;
}

export function executeSncCommands(
  commands: SncCommand[],
  mixer: SimpleMixer,
  context: SncExecutionContext,
  onWait?: (pcmChunk: Int16Array, seconds: number) => void,
): void {
  const activeStreams = new Map<string, SncStream>();
  const known = context.knownAliases ? new Set(context.knownAliases) : undefined;
  let releaseResidual: Float64Array | null = null;
  const fadeMs = context.releaseFadeMs ?? DEFAULT_RELEASE_FADE_MS;
  const fadeSec = fadeMs / 1000;

  for (const command of commands) {
    if (command.type === "clear") {
      mixer.clearBuffer();
      releaseResidual = null;
      continue;
    }

    if (command.type === "alias") {
      if (known && !known.has(command.name)) {
        throw new Error(`Unknown alias '${command.name}'`);
      }
      if (command.flag === "r") {
        const stream = activeStreams.get(command.name);
        activeStreams.delete(command.name);
        if (stream && fadeMs > 0) {
          const fadeSamples = Math.max(1, Math.round(fadeSec * context.sampleRate));
          const actualFadeSec = fadeSamples / context.sampleRate;
          const raw = stream.getSamples(actualFadeSec);
          const faded = applyLinearFadeOut(raw);
          releaseResidual = mergeResidualFade(releaseResidual, faded);
        }
        continue;
      }

      if (command.duration === -1) {
        getOrCreateStream(activeStreams, command.name, context);
        continue;
      }

      if (command.duration < 0) {
        throw new Error(`Negative duration for alias '${command.name}' is invalid`);
      }

      const stream = context.createStreamForAlias(command.name);
      stream.reset();
      const oneshot = stream.getSamples(command.duration);
      mixer.addBuffer(oneshot);
      continue;
    }

    const waitSamples = Math.max(0, Math.round(command.seconds * context.sampleRate));
    if (releaseResidual && releaseResidual.length > 0 && waitSamples > 0) {
      const { head, rest } = takeResidualHead(releaseResidual, waitSamples);
      releaseResidual = rest;
      if (head.length > 0) {
        mixer.addBuffer(head);
      }
    }
    for (const stream of activeStreams.values()) {
      const chunk = stream.getSamples(command.seconds);
      mixer.addBuffer(chunk);
    }
    /** Rests with no sustaining notes must still advance time (digital silence). */
    let mixedChunk: Int16Array =
      mixer.size === 0 && waitSamples > 0 ? new Int16Array(waitSamples) : mixer.getBuffer(waitSamples);
    if (mixedChunk.length < waitSamples) {
      const padded = new Int16Array(waitSamples);
      padded.set(mixedChunk);
      mixedChunk = padded;
    }
    if (onWait) {
      onWait(mixedChunk, command.seconds);
    }
    mixer.cutBuffer(waitSamples);
  }

  /** Score ends with `r` and no trailing `!wait` — flush the fade tail into the mixer. */
  if (releaseResidual && releaseResidual.length > 0) {
    const n = releaseResidual.length;
    const head = new Int16Array(n);
    for (let i = 0; i < n; i += 1) {
      head[i] = clampInt16(releaseResidual[i]);
    }
    mixer.addBuffer(head);
    let mixedChunk: Int16Array =
      mixer.size === 0 ? new Int16Array(0) : mixer.getBuffer(n);
    if (mixedChunk.length < n) {
      const padded = new Int16Array(n);
      padded.set(mixedChunk);
      mixedChunk = padded;
    }
    if (onWait) {
      onWait(mixedChunk, n / context.sampleRate);
    }
    mixer.cutBuffer(n);
  }
}
