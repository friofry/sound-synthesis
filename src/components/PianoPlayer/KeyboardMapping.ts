export const DEFAULT_KEYBINDS = [
  "KeyQ",
  "Digit2",
  "KeyW",
  "Digit3",
  "KeyE",
  "KeyR",
  "Digit5",
  "KeyT",
  "Digit6",
  "KeyY",
  "Digit7",
  "KeyU",
  "KeyZ",
  "KeyS",
  "KeyX",
  "KeyD",
  "KeyC",
  "KeyV",
  "KeyG",
  "KeyB",
  "KeyH",
  "KeyN",
  "KeyJ",
  "KeyM",
] as const;

export const DEFAULT_KEY_LABELS = [
  "Q",
  "2",
  "W",
  "3",
  "E",
  "R",
  "5",
  "T",
  "6",
  "Y",
  "7",
  "U",
  "Z",
  "S",
  "X",
  "D",
  "C",
  "V",
  "G",
  "B",
  "H",
  "N",
  "J",
  "M",
] as const;

const codeToIndex = new Map<string, number>(DEFAULT_KEYBINDS.map((code, index) => [code, index]));

export function getNoteIndexByCode(code: string): number | null {
  return codeToIndex.get(code) ?? null;
}

export function getCodeByNoteIndex(index: number): string | null {
  return DEFAULT_KEYBINDS[index] ?? null;
}

export function getLabelByNoteIndex(index: number): string {
  return DEFAULT_KEY_LABELS[index] ?? "";
}
