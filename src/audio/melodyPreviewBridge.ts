import type { AudioEngine } from "../components/PianoPlayer/AudioEngine";

type ConnectFn = (audio: HTMLAudioElement) => Promise<() => void>;

let connectHtml5: ConnectFn | null = null;

/** Called from `usePianoToolbar` so menu/actions can route preview audio through the piano analyser. */
export function registerMelodyPreviewAudioConnector(engine: AudioEngine | null): void {
  if (!engine) {
    connectHtml5 = null;
    return;
  }
  connectHtml5 = (audio) => engine.connectHtml5AudioForVisualization(audio);
}

export async function connectMelodyPreviewToAnalyser(audio: HTMLAudioElement): Promise<() => void> {
  if (!connectHtml5) {
    return () => {};
  }
  return connectHtml5(audio);
}
