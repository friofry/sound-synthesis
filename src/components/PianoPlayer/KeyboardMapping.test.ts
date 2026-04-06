import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBINDS,
  DEFAULT_KEY_LABELS,
  getCodeByNoteIndex,
  getLabelByNoteIndex,
  getNoteIndexByCode,
} from "./KeyboardMapping";

describe("KeyboardMapping", () => {
  it("keeps keybind and label arrays aligned", () => {
    expect(DEFAULT_KEYBINDS.length).toBe(DEFAULT_KEY_LABELS.length);
    expect(DEFAULT_KEYBINDS.length).toBeGreaterThan(0);
  });

  it("maps code to index and back", () => {
    for (let i = 0; i < DEFAULT_KEYBINDS.length; i += 1) {
      const code = DEFAULT_KEYBINDS[i];
      expect(getNoteIndexByCode(code)).toBe(i);
      expect(getCodeByNoteIndex(i)).toBe(code);
      expect(getLabelByNoteIndex(i)).toBe(DEFAULT_KEY_LABELS[i]);
    }
  });

  it("returns null/empty for unknown or out-of-range values", () => {
    expect(getNoteIndexByCode("UnknownCode")).toBeNull();
    expect(getCodeByNoteIndex(-1)).toBeNull();
    expect(getCodeByNoteIndex(999)).toBeNull();
    expect(getLabelByNoteIndex(-1)).toBe("");
    expect(getLabelByNoteIndex(999)).toBe("");
  });
});
