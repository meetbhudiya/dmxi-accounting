import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import { ApiError } from "../api/client";
import { money } from "../lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockRow {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number;
  openingStock: number;
  totalPurchased: number;
  available: number;
  reorderLevel: number;
  stockValue: number;
  isActive: boolean;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function Icon({ d, size = 18, color = "currentColor" }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  clipboard: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  check:     "M5 13l4 4L19 7",
  refresh:   "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  search:    "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",
  box:       "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  warning:   "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
};

function today() { return new Date().toISOString().slice(0, 10); }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StockCountPage() {
  const companyApi = useCompanyApi();
  const navigate = useNavigate();

  const [rows,    setRows]    = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [search,  setSearch]  = useState("");
  const [countDate, setCountDate] = useState(today());
  const [note,    setNote]    = useState("");

  // Counted quantities: productId → string input value
  const [counts, setCounts] = useState<Record<string, string>>({});


  function load() {
    setLoading(true);
    setError(null);
    setSuccess(false);
    companyApi.get<StockRow[]>("/stock-report")
      .then((data) => {
        setRows(data);
        // Pre-fill counts with current available qty
        const init: Record<string, string> = {};
        data.forEach((r) => { init[r.id] = String(r.available); });
        setCounts(init);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [companyApi]);

  const filtered = useMemo(() =>
    rows.filter((r) => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()) || (r.brand ?? "").toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );

  function getCount(id: string): number {
    return parseFloat(counts[id] ?? "") || 0;
  }

  function getVariance(row: StockRow): number {
    return getCount(row.id) - row.available;
  }

  const changedRows = rows.filter((r) => getVariance(r) !== 0);

  async function handleSave() {
    if (rows.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await companyApi.post("/stock-count", {
        countDate,
        note: note || undefined,
        items: rows.map((r) => ({
          productId:      r.id,
          productName:    r.name,
          brand:          r.brand,
          unit:           r.unit,
          systemQty:      r.available,
          countedQty:     getCount(r.id),
          variance:       getVariance(r),
          unitPrice:      r.unitPrice,
          totalPurchased: r.totalPurchased,
        })),
      });
      setSuccess(true);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save stock count");
    } finally {
      setSaving(false);
    }
  }

  // KPI summary
  const totalCounted    = rows.reduce((s, r) => s + getCount(r.id), 0);
  const totalVariance   = rows.reduce((s, r) => s + getVariance(r), 0);
  const adjustedUp      = changedRows.filter((r) => getVariance(r) > 0).length;
  const adjustedDown    = changedRows.filter((r) => getVariance(r) < 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1829 0%, #162040 100%)",
        borderRadius: 16, padding: "24px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -30, top: -30, width: 180, height: 180, borderRadius: "50%", background: "rgba(36,84,255,0.1)", pointerEvents: "none" }} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <button
              onClick={() => navigate("/stock")}
              title="Back to Stock Report"
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 9, padding: "7px 9px", cursor: "pointer", display: "flex", alignItems: "center",
                color: "#8fa3c0", transition: "background 0.12s, color 0.12s", flexShrink: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.16)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#8fa3c0"; }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1={19} y1={12} x2={5} y2={12} /><polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div style={{ background: "rgba(36,84,255,0.2)", borderRadius: 10, padding: 8, display: "flex" }}>
              <Icon d={ICONS.clipboard} size={20} color="#7aa2ff" />
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.4px" }}>Stock Count</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#4a5a72" }}>
            Record physical inventory counts and auto-adjust system quantities.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="btn"
            onClick={load}
            disabled={loading}
            style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "#8fa3c0", borderColor: "#2a3a52", background: "rgba(255,255,255,0.05)" }}
          >
            <Icon d={ICONS.refresh} size={13} /> Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || rows.length === 0}
            style={{ fontSize: 13, padding: "10px 20px", gap: 8, display: "flex", alignItems: "center" }}
          >
            <Icon d={ICONS.check} size={14} color="#fff" />
            {saving ? "Saving…" : `Save Count${changedRows.length > 0 ? ` (${changedRows.length} adj.)` : ""}`}
          </button>
        </div>
      </div>

      {/* ── Count metadata ── */}
      <div className="card" style={{ padding: "16px 20px", display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Count Date</div>
          <input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} style={{ width: 180, fontSize: 13 }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Notes</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. End-of-month physical count…"
            style={{ width: "100%", fontSize: 13 }}
          />
        </div>
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={11} cy={11} r={8} /><line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
          <input
            placeholder="Filter products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30, width: 200, fontSize: 13 }}
          />
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {[
          { label: "Products",      value: String(rows.length),      color: "#2454ff", bg: "#eef2ff" },
          { label: "Total Counted", value: totalCounted.toLocaleString(), color: "#0ea265", bg: "#f0fdf4" },
          { label: "Adjusted Up",   value: String(adjustedUp),       color: "#16a34a", bg: "#f0fdf4" },
          { label: "Adjusted Down", value: String(adjustedDown),     color: "#dc2626", bg: "#fef2f2" },
        ].map((c) => (
          <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Messages ── */}
      {error   && <div className="error-text">{error}</div>}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", color: "#15803d", fontWeight: 600, fontSize: 13 }}>
          <Icon d={ICONS.check} size={16} color="#16a34a" />
          Stock count saved successfully. Quantities have been updated.
        </div>
      )}

      {/* ── Table ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Legend */}
        <div style={{ display: "flex", gap: 20, padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg)", fontSize: 11.5, color: "var(--muted)" }}>
          <span><strong>System Qty</strong> — what the system thinks you have</span>
          <span><strong>Count</strong> — what you physically counted (edit these)</span>
          <span style={{ color: "#16a34a", fontWeight: 600 }}>+Variance</span> = surplus ·
          <span style={{ color: "#dc2626", fontWeight: 600 }}>−Variance</span> = shortage
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Product</th>
              <th style={{ width: 110 }}>Brand</th>
              <th style={{ width: 70 }}>Unit</th>
              <th style={{ width: 110, textAlign: "right" }}>System Qty</th>
              <th style={{ width: 140, textAlign: "right" }}>Count</th>
              <th style={{ width: 110, textAlign: "right" }}>Variance</th>
              <th style={{ width: 130, textAlign: "right" }}>Unit Price</th>
              <th style={{ width: 140, textAlign: "right" }}>Count Value</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading stock data…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                {rows.length === 0 ? "No products found. Add products first." : "No products match the filter."}
              </td></tr>
            )}
            {filtered.map((r, idx) => {
              const counted  = getCount(r.id);
              const variance = counted - r.available;
              const changed  = variance !== 0;
              const countVal = counted * r.unitPrice;

              return (
                <tr
                  key={r.id}
                  style={{
                    background: changed
                      ? variance > 0 ? "rgba(16,185,129,0.04)" : "rgba(220,38,38,0.04)"
                      : undefined,
                    opacity: r.isActive ? 1 : 0.5,
                    transition: "background 0.15s",
                  }}
                >
                  <td style={{ color: "var(--muted)", fontSize: 12, paddingLeft: 18 }}>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    {r.description && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.description}</div>}
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{r.brand ?? "—"}</td>
                  <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{r.unit ?? "—"}</td>

                  {/* System qty */}
                  <td style={{ textAlign: "right", fontWeight: 600, fontSize: 14, paddingRight: 14 }}>
                    {r.available}
                  </td>

                  {/* Editable count input */}
                  <td style={{ paddingRight: 14 }}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={counts[r.id] ?? ""}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      style={{
                        width: "100%",
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: 14,
                        border: `1.5px solid ${changed ? (variance > 0 ? "#16a34a" : "#dc2626") : "var(--border)"}`,
                        borderRadius: 8,
                        padding: "6px 10px",
                        background: changed ? (variance > 0 ? "#f0fdf4" : "#fef2f2") : "var(--bg)",
                        color: changed ? (variance > 0 ? "#16a34a" : "#dc2626") : "var(--text)",
                        transition: "all 0.15s",
                        outline: "none",
                      }}
                    />
                  </td>

                  {/* Variance */}
                  <td style={{ textAlign: "right", fontWeight: 700, paddingRight: 14, fontSize: 14 }}>
                    {variance === 0 ? (
                      <span style={{ color: "var(--muted)", fontWeight: 400 }}>—</span>
                    ) : (
                      <span style={{
                        color: variance > 0 ? "#16a34a" : "#dc2626",
                        background: variance > 0 ? "#f0fdf4" : "#fef2f2",
                        border: `1px solid ${variance > 0 ? "#bbf7d0" : "#fecaca"}`,
                        borderRadius: 6, padding: "2px 8px", fontSize: 12,
                      }}>
                        {variance > 0 ? "+" : ""}{variance}
                      </span>
                    )}
                  </td>

                  <td style={{ textAlign: "right", color: "var(--muted)", fontSize: 13 }}>{money(r.unitPrice)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, paddingRight: 14 }}>{money(countVal)}</td>
                </tr>
              );
            })}
          </tbody>

          {!loading && filtered.length > 0 && (() => {
            const filteredCountTotal = filtered.reduce((s, r) => s + getCount(r.id) * r.unitPrice, 0);
            const filteredVarianceTotal = filtered.reduce((s, r) => s + getVariance(r), 0);
            return (
              <tfoot>
                <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={4} style={{ padding: "12px 18px", fontWeight: 700, fontSize: 13 }}>
                    Total ({filtered.length} products)
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, paddingRight: 14 }}>
                    {filtered.reduce((s, r) => s + r.available, 0)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, paddingRight: 14 }}>
                    {filtered.reduce((s, r) => s + getCount(r.id), 0)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, paddingRight: 14 }}>
                    <span style={{ color: filteredVarianceTotal >= 0 ? "#16a34a" : "#dc2626" }}>
                      {filteredVarianceTotal > 0 ? "+" : ""}{filteredVarianceTotal}
                    </span>
                  </td>
                  <td />
                  <td style={{ textAlign: "right", fontWeight: 800, fontSize: 15, color: "#2454ff", paddingRight: 14 }}>
                    {money(filteredCountTotal)}
                  </td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>

      {/* ── Bottom save bar ── */}
      {changedRows.length > 0 && (
        <div style={{
          position: "sticky", bottom: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#eef2ff", borderRadius: 8, padding: "6px 7px", display: "flex" }}>
              <Icon d={ICONS.warning} size={16} color="#2454ff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {changedRows.length} product{changedRows.length !== 1 ? "s" : ""} will be adjusted
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
                {adjustedUp > 0 && <span style={{ color: "#16a34a", marginRight: 10 }}>▲ {adjustedUp} surplus</span>}
                {adjustedDown > 0 && <span style={{ color: "#dc2626" }}>▼ {adjustedDown} shortage</span>}
                {totalVariance !== 0 && (
                  <span style={{ marginLeft: 10, color: "var(--muted)" }}>
                    · Net: <strong style={{ color: totalVariance > 0 ? "#16a34a" : "#dc2626" }}>{totalVariance > 0 ? "+" : ""}{totalVariance} units</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "11px 24px", fontSize: 14, fontWeight: 700, gap: 8, display: "flex", alignItems: "center" }}
          >
            <Icon d={ICONS.check} size={15} color="#fff" />
            {saving ? "Saving…" : "Confirm & Save Count"}
          </button>
        </div>
      )}
    </div>
  );
}
