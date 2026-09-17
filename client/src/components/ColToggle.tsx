import { useState, useEffect, useRef } from "react";

export interface ColDef {
  key: string;
  label: string;
  locked?: boolean;
  defaultVis: boolean;
}

/** Persistent column-visibility state backed by localStorage. */
export function useColVis(storageKey: string, cols: ColDef[]) {
  const defaults = Object.fromEntries(cols.map((c) => [c.key, c.defaultVis]));
  const [vis, setVis] = useState<Record<string, boolean>>(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
    } catch {
      return defaults;
    }
  });

  function toggle(key: string) {
    setVis((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function show(key: string) { return vis[key] !== false; }

  // Total count of currently visible columns (locked cols always count)
  const visCount = cols.filter((c) => c.locked || vis[c.key]).length;

  return { vis, toggle, show, visCount };
}

/** Button + dropdown panel for toggling column visibility. */
export function ColToggle({ cols, vis, onToggle }: {
  cols: ColDef[];
  vis: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const hiddenCount = cols.filter((c) => !c.locked && !vis[c.key]).length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        Columns
        {hiddenCount > 0 && (
          <span style={{ background: "#2454ff", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "1px 6px" }}>
            {hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 400,
          background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12,
          padding: "14px 16px", minWidth: 200, boxShadow: "0 10px 32px rgba(0,0,0,0.14)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            Visible Columns
          </div>
          {cols.map((c, i) => (
            <label key={c.key} style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: "6px 0",
              borderBottom: i < cols.length - 1 ? "1px solid var(--border)" : undefined,
              cursor: c.locked ? "default" : "pointer",
              fontSize: 13,
              color: c.locked ? "var(--muted)" : "var(--text)",
              userSelect: "none",
            }}>
              <input
                type="checkbox"
                checked={c.locked || vis[c.key] !== false}
                disabled={c.locked}
                onChange={() => !c.locked && onToggle(c.key)}
                style={{ cursor: c.locked ? "default" : "pointer", flexShrink: 0 }}
              />
              <span style={{ flex: 1 }}>{c.label}</span>
              {c.locked && (
                <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  always
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
