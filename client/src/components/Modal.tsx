import { useEffect, type ReactNode } from "react";

export default function Modal({
  title,
  onClose,
  children,
  maxWidth,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number | string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingBottom: 16, borderBottom: "1px solid var(--border)",
          marginBottom: 2,
        }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg)", border: "1.5px solid var(--border)",
              borderRadius: 7, width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1,
              flexShrink: 0, transition: "background 0.12s",
            }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
