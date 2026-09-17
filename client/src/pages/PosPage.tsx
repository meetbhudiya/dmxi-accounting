export default function PosPage() {
  const features = [
    {
      icon: "🖥️",
      title: "Touchscreen POS Terminal",
      desc: "Sell fast from a touchscreen till — search products, add to cart, apply discounts and collect payment in seconds.",
    },
    {
      icon: "🧾",
      title: "Receipt Printing",
      desc: "Print thermal receipts automatically after every sale. Supports 58mm and 80mm receipt printers.",
    },
    {
      icon: "💰",
      title: "Cash Drawer Management",
      desc: "Open cash drawer on payment, track float, and run end-of-day Z-reports from the terminal.",
    },
    {
      icon: "📡",
      title: "Live Back-Office Sync",
      desc: "Every POS sale posts directly to this web app in real time — inventory, invoices and payments update automatically.",
    },
    {
      icon: "📦",
      title: "Live Stock Deduction",
      desc: "Stock levels drop instantly when a sale is made at the POS, so the back-office always reflects what's on the shelf.",
    },
    {
      icon: "🔀",
      title: "Multi-Terminal Support",
      desc: "Run multiple POS terminals in the same location, all syncing to one back-office database.",
    },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* ── Coming Soon Banner ──────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 16,
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        color: "#fff",
        padding: "48px 40px",
        marginBottom: 32,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative rings */}
        <div style={{
          position: "absolute", right: -60, top: -60,
          width: 280, height: 280, borderRadius: "50%",
          border: "40px solid rgba(36,84,255,0.15)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", right: 40, top: 40,
          width: 140, height: 140, borderRadius: "50%",
          border: "20px solid rgba(36,84,255,0.1)",
          pointerEvents: "none",
        }} />

        <span style={{
          display: "inline-block",
          background: "#f59e0b",
          color: "#fff",
          fontSize: 11, fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          borderRadius: 6,
          padding: "4px 12px",
          marginBottom: 20,
        }}>
          Coming Soon
        </span>

        <h1 style={{ margin: "0 0 12px", fontSize: 34, fontWeight: 800, lineHeight: 1.15 }}>
          POS Connectivity
        </h1>

        <p style={{ margin: "0 0 28px", fontSize: 15, color: "#94a3b8", maxWidth: 520, lineHeight: 1.65 }}>
          Connect a Point of Sale terminal directly to DMXI. The POS handles counter sales, receipts
          and cash — this web app is your back-office for inventory, reports and accounting.
          Everything syncs in real time.
        </p>

        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#2454ff" }}>POS</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Fast counter sales</div>
          </div>
          <div style={{ color: "#334155", fontSize: 28, alignSelf: "center" }}>⇄</div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#2454ff" }}>DMXI</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Back-office & reports</div>
          </div>
        </div>
      </div>

      {/* ── What's coming ───────────────────────────────────────────────────── */}
      <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>What's included</h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
        gap: 16,
        marginBottom: 32,
      }}>
        {features.map((f) => (
          <div key={f.title} className="card" style={{ margin: 0, padding: "20px 22px" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* ── Architecture diagram ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 700 }}>How it works</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { icon: "🖥️", label: "POS Terminal", sub: "Counter sales" },
            { arrow: true },
            { icon: "🗄️", label: "Shared Database", sub: "PostgreSQL" },
            { arrow: true },
            { icon: "🌐", label: "DMXI Web App", sub: "Back-office" },
          ].map((item, i) =>
            "arrow" in item ? (
              <div key={i} style={{ fontSize: 22, color: "var(--muted)", padding: "0 12px" }}>⟷</div>
            ) : (
              <div key={i} style={{
                textAlign: "center", padding: "16px 24px",
                background: "var(--bg)", borderRadius: 12,
                border: "1px solid var(--border)",
                minWidth: 130,
              }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{item.sub}</div>
              </div>
            )
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 18, marginBottom: 0, textAlign: "center" }}>
          The POS terminal and this web app share the same PostgreSQL database.
          Sales at the counter instantly appear in Invoices, Payments and Stock here.
        </p>
      </div>
    </div>
  );
}
