import type { RawInstrumentNote } from "../../engine/types";

type ActiveVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

export class AudioEngine {
  private readonly audioContext: AudioContext;
  private readonly analyserNode: AnalyserNode;
  private readonly noteBuffers = new Map<string, AudioBuffer>();
  private readonly rawNotes = new Map<string, RawInstrumentNote>();
  private readonly activeVoices = new Map<string, Set<ActiveVoice>>();

  public constructor() {
    this.audioContext = new AudioContext();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.82;
    this.analyserNode.connect(this.audioContext.destination);
  }

  public get analyser(): AnalyserNode {
    return this.analyserNode;
  }

  public get sampleRate(): number {
    return this.audioContext.sampleRate;
  }

  public loadInstrument(notes: RawInstrumentNote[]): void {
    this.noteBuffers.clear();
    this.rawNotes.clear();
    for (const note of notes) {
      this.setNote(note);
    }
  }

  public setNote(note: RawInstrumentNote): void {
    const audioBuffer = this.audioContext.createBuffer(1, note.buffer.length, note.sampleRate);
    audioBuffer.getChannelData(0).set(note.buffer);
    this.noteBuffers.set(note.alias, audioBuffer);
    this.rawNotes.set(note.alias, note);
  }

  public getRawNote(alias: string): RawInstrumentNote | null {
    return this.rawNotes.get(alias) ?? null;
  }

  public async decodeAudioBufferFromFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer.slice(0));
  }

  public async playNote(alias: string): Promise<void> {
    await this.ensureRunning();
    const audioBuffer = this.noteBuffers.get(alias);
    if (!audioBuffer) {
      return;
    }

    const source = this.audioContext.createBufferSource();
    const gain = this.audioContext.createGain();
    source.buffer = audioBuffer;
    gain.gain.value = 1;

    source.connect(gain);
    gain.connect(this.analyserNode);

    const voice: ActiveVoice = { source, gain };
    let voices = this.activeVoices.get(alias);
    if (!voices) {
      voices = new Set<ActiveVoice>();
      this.activeVoices.set(alias, voices);
    }
    voices.add(voice);

    source.onended = () => {
      const currentVoices = this.activeVoices.get(alias);
      if (!currentVoices) {
        return;
      }
      currentVoices.delete(voice);
      if (currentVoices.size === 0) {
        this.activeVoices.delete(alias);
      }
    };

    source.start();
  }

  public stopNote(alias: string, immediate = false): void {
    const voices = this.activeVoices.get(alias);
    if (!voices) {
      return;
    }

    const now = this.audioContext.currentTime;
    for (const voice of voices) {
      if (immediate) {
        voice.source.stop();
        continue;
      }
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.001), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      voice.source.stop(now + 0.31);
    }
  }

  public stopAll(immediate = true): void {
    const aliases = [...this.activeVoices.keys()];
    for (const alias of aliases) {
      this.stopNote(alias, immediate);
    }
  }

  private async ensureRunning(): Promise<void> {
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }
}
