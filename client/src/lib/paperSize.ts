const STORAGE_KEY  = "dmxi_paper_size";
const CHANGE_EVENT = "dmxi_paper_changed";

export type PaperPresetKey = "a4" | "a5" | "letter" | "legal" | "a3" | "custom";

export interface PaperPreset {
  key:   PaperPresetKey;
  label: string;
  desc:  string;
  w:     number;  // portrait width mm
  h:     number;  // portrait height mm
}

export const PAPER_PRESETS: PaperPreset[] = [
  { key: "a4",     label: "A4",        desc: "210 × 297 mm", w: 210, h: 297 },
  { key: "a5",     label: "A5",        desc: "148 × 210 mm", w: 148, h: 210 },
  { key: "letter", label: "US Letter", desc: "216 × 279 mm", w: 216, h: 279 },
  { key: "legal",  label: "US Legal",  desc: "216 × 356 mm", w: 216, h: 356 },
  { key: "a3",     label: "A3",        desc: "297 × 420 mm", w: 297, h: 420 },
];

export interface StoredPaperSize {
  key:     PaperPresetKey;
  custom?: { w: number; h: number };
}

const DEFAULT: StoredPaperSize = { key: "a4" };
let _current: StoredPaperSize = DEFAULT;

export function initPaperSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _current  = raw ? (JSON.parse(raw) as StoredPaperSize) : DEFAULT;
  } catch {
    _current = DEFAULT;
  }
}

export function getStoredPaperSize(): StoredPaperSize {
  return _current;
}

export function savePaperSize(ps: StoredPaperSize) {
  _current = ps;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ps));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onPaperSizeChanged(fn: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, fn);
  return () => window.removeEventListener(CHANGE_EVENT, fn);
}

/**
 * Returns a jsPDF constructor config for the requested orientation.
 * Named presets pass the key as format + explicit orientation.
 * Custom sizes encode orientation via array dimension order (no orientation flag).
 */
export function getPaperConfig(orientation: "portrait" | "landscape" = "portrait"): {
  unit: "mm";
  format: string | [number, number];
  orientation?: "portrait" | "landscape";
} {
  if (_current.key === "custom" && _current.custom) {
    const { w, h } = _current.custom;
    const [pw, ph] = orientation === "portrait"
      ? [Math.min(w, h), Math.max(w, h)]
      : [Math.max(w, h), Math.min(w, h)];
    return { unit: "mm", format: [pw, ph] };
  }
  return { unit: "mm", format: _current.key, orientation };
}
