const DEFAULT_MERGE_LIMIT_MS = 25;
const DEFAULT_FINISH_WAIT_SECONDS = 2;

type SncCreatorOptions = {
  clockMs?: () => number;
  mergeLimitMs?: number;
  finishWaitSeconds?: number;
};

export class SncCreator {
  private readonly aliases: string[];
  private readonly clockMs: () => number;
  private readonly mergeLimitMs: number;
  private readonly finishWaitSeconds: number;
  private isRecording: boolean;
  private lastStatePlaying: Map<string, boolean>;
  private lines: string[];
  private lastTimeMs: number;
  private startTimeMs: number;

  public constructor(aliases: string[], options: SncCreatorOptions = {}) {
    this.aliases = [...aliases];
    this.clockMs = options.clockMs ?? (() => performance.now());
    this.mergeLimitMs = options.mergeLimitMs ?? DEFAULT_MERGE_LIMIT_MS;
    this.finishWaitSeconds = options.finishWaitSeconds ?? DEFAULT_FINISH_WAIT_SECONDS;
    this.isRecording = false;
    this.lines = [];
    this.lastStatePlaying = new Map<string, boolean>();
    this.lastTimeMs = 0;
    this.startTimeMs = 0;
    this.resetState();
  }

  public get rendering(): boolean {
    return this.isRecording;
  }

  public start(): void {
    this.lines = [];
    this.resetState();
    this.isRecording = true;
    this.startTimeMs = this.clockMs();
    this.lastTimeMs = this.startTimeMs;
  }

  public keyEvent(activeAliases: Set<string>, clear = false): void {
    if (!this.isRecording) {
      return;
    }

    if (clear) {
      this.lines.push("!clear");
      for (const alias of this.aliases) {
        this.lastStatePlaying.set(alias, false);
      }
      this.lastTimeMs = this.clockMs();
      return;
    }

    const now = this.clockMs();
    let elapsedMs = now - this.lastTimeMs;
    if (elapsedMs < this.mergeLimitMs) {
      elapsedMs = 0;
    }

    let encounteredChanges = false;
    for (const alias of this.aliases) {
      const isPlaying = activeAliases.has(alias);
      const wasPlaying = this.lastStatePlaying.get(alias) ?? false;
      if (isPlaying && !wasPlaying) {
        if (!encounteredChanges && elapsedMs > 0) {
          const timePassedMs = Math.max(0, Math.round(now - this.startTimeMs));
          const millis = timePassedMs % 1000;
          const seconds = Math.floor(timePassedMs / 1000) % 60;
          const minutes = Math.floor(timePassedMs / 60000);
          this.lines.push(
            `--Current position: ${minutes}:${seconds},${millis} ms`,
            `!wait ${(elapsedMs / 1000).toFixed(4)}`,
          );
        }
        encounteredChanges = true;
        this.lines.push(`${alias} a -1`);
      }
      this.lastStatePlaying.set(alias, isPlaying);
    }

    if (encounteredChanges && elapsedMs > 0) {
      this.lastTimeMs = now;
    }
  }

  public finish(): string {
    if (!this.isRecording) {
      return this.lines.join("\n");
    }
    this.lines.push("--Finishing wait", `!wait ${this.finishWaitSeconds}`);
    this.isRecording = false;
    return this.lines.join("\n");
  }

  private resetState(): void {
    this.lastStatePlaying = new Map<string, boolean>();
    for (const alias of this.aliases) {
      this.lastStatePlaying.set(alias, false);
    }
  }
}
