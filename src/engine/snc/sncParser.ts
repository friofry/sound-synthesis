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
    const line = raw.trim();

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

function getOrCreateStream(
  activeStreams: Map<string, SncStream>,
  alias: string,
  context: SncExecutionContext,
): SncStream {
  let stream = activeStreams.get(alias);
  if (!stream) {
    stream = context.createStreamForAlias(alias);
    activeStreams.set(alias, stream);
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

  for (const command of commands) {
    if (command.type === "clear") {
      mixer.clearBuffer();
      continue;
    }

    if (command.type === "alias") {
      if (known && !known.has(command.name)) {
        throw new Error(`Unknown alias '${command.name}'`);
      }
      if (command.flag === "r") {
        activeStreams.delete(command.name);
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
    for (const stream of activeStreams.values()) {
      const chunk = stream.getSamples(command.seconds);
      mixer.addBuffer(chunk);
    }
    const mixedChunk = mixer.getBuffer(waitSamples);
    if (onWait) {
      onWait(mixedChunk, command.seconds);
    }
    mixer.cutBuffer(waitSamples);
  }
}
