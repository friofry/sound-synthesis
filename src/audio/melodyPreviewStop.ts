/** Stops HTMLAudio-based SNC/MIDI melody previews (community menu + piano toolbar). */
const stopCallbacks = new Set<() => void>();

export function registerMelodyPreviewStop(stop: () => void): () => void {
  stopCallbacks.add(stop);
  return () => {
    stopCallbacks.delete(stop);
  };
}

export function stopAllMelodyPreviewPlayback(): void {
  for (const stop of [...stopCallbacks]) {
    stop();
  }
}
