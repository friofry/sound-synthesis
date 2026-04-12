export const MixMode = {
  Saturation: 1,
  Regulation: 2,
} as const;

export type MixMode = (typeof MixMode)[keyof typeof MixMode];

export type SncCommand =
  | { type: "clear" }
  | { type: "wait"; seconds: number }
  | { type: "alias"; name: string; flag: "a" | "r"; duration: number };

export type SncAliasDefinition = {
  name: string;
  source: string;
  gain: number;
};

export type SncParseResult = {
  aliases: Map<string, SncAliasDefinition>;
  commands: SncCommand[];
};

export interface SncStream {
  getSamples(durationSeconds: number): Int16Array;
  reset(): void;
}

export type SncExecutionContext = {
  sampleRate: number;
  knownAliases?: Iterable<string>;
  createStreamForAlias: (alias: string) => SncStream;
  /**
   * Fade-out duration when a sustaining note is released (`r`), to avoid a click at note-off.
   * Defaults are applied in `executeSncCommands` if unset.
   */
  releaseFadeMs?: number;
};
