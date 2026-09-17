export const THEMES = {
  light: {
    label: "Light (Default)",
    preview: "#2454ff",
    vars: {
      "--bg":           "#f4f6f9",
      "--surface":      "#ffffff",
      "--border":       "#e0e4eb",
      "--text":         "#1f2733",
      "--muted":        "#6b7785",
      "--primary":      "#2454ff",
      "--primary-dark": "#173bcc",
      "--danger":       "#d6334c",
      "--success":      "#1e9e6b",
      "--bg-hover":     "#f0f2f6",
      "--sidebar-bg":   "#161b27",
      "--sidebar-text": "#cdd5e1",
    },
  },
  dark: {
    label: "Dark",
    preview: "#3b82f6",
    vars: {
      "--bg":           "#0f172a",
      "--surface":      "#1e293b",
      "--border":       "#334155",
      "--text":         "#e2e8f0",
      "--muted":        "#94a3b8",
      "--primary":      "#3b82f6",
      "--primary-dark": "#2563eb",
      "--danger":       "#f87171",
      "--success":      "#34d399",
      "--bg-hover":     "#263348",
      "--sidebar-bg":   "#0a1220",
      "--sidebar-text": "#94a3b8",
    },
  },
  ocean: {
    label: "Ocean",
    preview: "#0077b6",
    vars: {
      "--bg":           "#e8f4fd",
      "--surface":      "#ffffff",
      "--border":       "#b3d4f0",
      "--text":         "#0c2340",
      "--muted":        "#3d6e99",
      "--primary":      "#0077b6",
      "--primary-dark": "#005f92",
      "--danger":       "#d6334c",
      "--success":      "#1e9e6b",
      "--bg-hover":     "#d9eefb",
      "--sidebar-bg":   "#023e6b",
      "--sidebar-text": "#90caf9",
    },
  },
  emerald: {
    label: "Emerald",
    preview: "#059669",
    vars: {
      "--bg":           "#ecfdf5",
      "--surface":      "#ffffff",
      "--border":       "#a7f3d0",
      "--text":         "#064e3b",
      "--muted":        "#047857",
      "--primary":      "#059669",
      "--primary-dark": "#047857",
      "--danger":       "#dc2626",
      "--success":      "#059669",
      "--bg-hover":     "#d1fae5",
      "--sidebar-bg":   "#064e3b",
      "--sidebar-text": "#6ee7b7",
    },
  },
  purple: {
    label: "Purple",
    preview: "#7c3aed",
    vars: {
      "--bg":           "#f5f3ff",
      "--surface":      "#ffffff",
      "--border":       "#ddd6fe",
      "--text":         "#1e1b4b",
      "--muted":        "#6d5cc7",
      "--primary":      "#7c3aed",
      "--primary-dark": "#6d28d9",
      "--danger":       "#dc2626",
      "--success":      "#059669",
      "--bg-hover":     "#ede9fe",
      "--sidebar-bg":   "#1e1b4b",
      "--sidebar-text": "#c4b5fd",
    },
  },
} as const;

export type ThemeKey = keyof typeof THEMES;

const STORAGE_KEY = "dmxi_theme";

export function getStoredThemeKey(): ThemeKey {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
  return stored && stored in THEMES ? stored : "light";
}

export function applyTheme(key: ThemeKey) {
  const theme = THEMES[key];
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, val);
  }
  localStorage.setItem(STORAGE_KEY, key);
}
