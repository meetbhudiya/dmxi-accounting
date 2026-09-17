type Props = { open: boolean; onClose: () => void };

function Key({ k }: { k: string }) {
  return (
    <kbd style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 26, padding: "3px 7px",
      background: "#f5f7fa",
      border: "1px solid #d0d7de",
      borderBottom: "2px solid #bac0c8",
      borderRadius: 5,
      fontFamily: "monospace",
      fontSize: 12, fontWeight: 700,
      color: "#24292f",
      lineHeight: 1.4,
    }}>{k}</kbd>
  );
}

function Row({ keys, label, sep = "+" }: { keys: string[]; label: string; sep?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--text)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {keys.map((k, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {i > 0 && <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>{sep}</span>}
            <Key k={k} />
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 4, paddingTop: 4,
      }}>{title}</div>
      {children}
    </div>
  );
}

export default function ShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(8,15,30,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200,
        animation: "backdropIn 0.15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          width: 480,
          maxHeight: "82vh",
          overflowY: "auto",
          boxShadow: "0 24px 56px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.05)",
          animation: "modalIn 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 22px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#eef2ff", borderRadius: 8, padding: 7, color: "#2454ff" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 7,
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 22px 22px", display: "flex", flexDirection: "column", gap: 20 }}>

          <Section title="Navigation — Ctrl + key">
            <Row keys={["Ctrl", "D"]} label="Dashboard" />
            <Row keys={["Ctrl", "I"]} label="Invoices" />
            <Row keys={["Ctrl", "P"]} label="Purchases" />
            <Row keys={["Ctrl", "E"]} label="Expenses" />
            <Row keys={["Ctrl", "U"]} label="Customers" />
            <Row keys={["Ctrl", "B"]} label="Vendors" />
            <Row keys={["Ctrl", "R"]} label="Reports" />
            <Row keys={["Ctrl", "L"]} label="Ledger" />
            <Row keys={["Ctrl", "O"]} label="Products" />
            <Row keys={["Ctrl", "S"]} label="Settings" />
          </Section>

          <Section title="Actions">
            <Row keys={["N"]}          label="New item (on current page)" />
            <Row keys={["Ctrl", "/"]}  label="Show this help" />
            <Row keys={["?"]}          label="Show this help (alternate)" />
            <Row keys={["Esc"]}        label="Close / go back" />
          </Section>

          <Section title="List Navigation">
            <Row keys={["PgDn"]} sep=""  label="Move cursor down the list" />
            <Row keys={["PgUp"]} sep=""  label="Move cursor up the list" />
            <Row keys={["Enter"]} sep="" label="Open highlighted row" />
            <Row keys={["Esc"]} sep=""   label="Clear row highlight" />
          </Section>

          <Section title="Open Detail — flip without closing">
            <Row keys={["↓"]} sep=""  label="Next item in list" />
            <Row keys={["↑"]} sep=""  label="Previous item in list" />
          </Section>

          <Section title="Form Fields (Invoices / Quotes / Purchases)">
            <Row keys={["Enter"]} sep="" label="Advance to next field" />
            <Row keys={["⌫"]} sep=""    label="Retreat to previous field (when empty)" />
            <Row keys={["Esc"]} sep=""   label="Exit form back to list" />
          </Section>

        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 22px", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            Navigation works anywhere. <Key k="N" /> only fires outside input fields.
          </span>
        </div>
      </div>
    </div>
  );
}
