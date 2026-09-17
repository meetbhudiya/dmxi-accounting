import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import { money } from "../lib/format";
import { downloadStockCountPdf } from "../lib/exportPdf";
import { exportStockCountExcel } from "../lib/exportExcel";

interface StockRow {
  id: string;
  name: string;
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

interface StockCountItem {
  id:          string;
  productName: string;
  brand:       string | null;
  unit:        string | null;
  systemQty:   number;
  countedQty:  number;
  variance:    number;
  unitPrice:   number;
}

interface StockCountRecord {
  id:        string;
  countDate: string;
  note:      string | null;
  createdBy: string;
  createdAt: string;
  items:     StockCountItem[];
}

type Filter = "all" | "low" | "out";

function stockStatus(row: StockRow): "out" | "low" | "ok" {
  if (row.available <= 0) return "out";
  if (row.reorderLevel > 0 && row.available <= row.reorderLevel) return "low";
  return "ok";
}

const STATUS_CFG = {
  out: { label: "Out of Stock", bg: "#fef2f2", color: "#dc2626", dot: "#dc2626" },
  low: { label: "Low Stock",    bg: "#fffbeb", color: "#d97706", dot: "#d97706" },
  ok:  { label: "In Stock",     bg: "#f0fdf4", color: "#16a34a", dot: "#16a34a" },
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Small icon button ─────────────────────────────────────────────────────────

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="btn"
      onClick={onClick}
      title={title}
      style={{ padding: "7px 9px", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {children}
    </button>
  );
}

// ── History drawer ────────────────────────────────────────────────────────────

function HistoryDrawer({ open, onClose, companyName }: { open: boolean; onClose: () => void; companyName: string }) {
  const companyApi = useCompanyApi();
  const [counts,   setCounts]   = useState<StockCountRecord[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    companyApi.get<StockCountRecord[]>("/stock-counts")
      .then(setCounts)
      .finally(() => setLoading(false));
  }, [open, companyApi]);

  if (!open) return null;

  async function handlePdf(c: StockCountRecord) {
    setExporting(c.id + "-pdf");
    try { downloadStockCountPdf(c, companyName); }
    finally { setExporting(null); }
  }

  async function handleExcel(c: StockCountRecord) {
    setExporting(c.id + "-xlsx");
    try { await exportStockCountExcel(c, companyName); }
    finally { setExporting(null); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex" }}>
      {/* Backdrop */}
      <div
        style={{ flex: 1, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        width: 520, background: "var(--bg)", display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        {/* Panel header */}
        <div style={{
          background: "linear-gradient(135deg, #0f1829 0%, #162040 100%)",
          padding: "20px 22px", display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "rgba(36,84,255,0.2)", borderRadius: 8, padding: "7px", display: "flex" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#7aa2ff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx={12} cy={12} r={10} />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Count History</div>
              <div style={{ fontSize: 11, color: "#4a5a72", marginTop: 1 }}>
                {counts.length > 0 ? `${counts.length} sessions recorded` : "No sessions yet"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", color: "#8fa3c0", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>Loading history…</div>
          )}
          {!loading && counts.length === 0 && (
            <div style={{ textAlign: "center", padding: 50 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>No stock counts yet</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>Perform a count to see history here.</div>
            </div>
          )}
          {counts.map((c) => {
            const changedCount = c.items.filter((i) => Number(i.variance) !== 0).length;
            const netVariance  = c.items.reduce((s, i) => s + Number(i.variance), 0);
            const isExpanded   = expanded === c.id;

            return (
              <div key={c.id} style={{
                border: "1px solid var(--border)", borderRadius: 12,
                background: "var(--surface)", overflow: "hidden",
                transition: "box-shadow 0.15s",
              }}>
                {/* Card header */}
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* Date badge */}
                  <div style={{
                    background: "linear-gradient(135deg, #eef2ff, #e8edff)", border: "1px solid #c7d7ff",
                    borderRadius: 10, padding: "8px 12px", textAlign: "center", flexShrink: 0, minWidth: 60,
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#2454ff", lineHeight: 1 }}>
                      {new Date(c.countDate).getDate().toString().padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#6080c0", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 1 }}>
                      {new Date(c.countDate).toLocaleDateString("en-KE", { month: "short" })} {new Date(c.countDate).getFullYear()}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtDate(c.countDate)}</span>
                      {changedCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#eef2ff", color: "#2454ff", borderRadius: 6, padding: "2px 7px" }}>
                          {changedCount} adjusted
                        </span>
                      )}
                      {netVariance !== 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 7px",
                          background: netVariance > 0 ? "#f0fdf4" : "#fef2f2",
                          color: netVariance > 0 ? "#16a34a" : "#dc2626",
                        }}>
                          {netVariance > 0 ? "+" : ""}{netVariance} net
                        </span>
                      )}
                    </div>
                    {c.note && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>"{c.note}"</div>}
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {c.items.length} products · by {c.createdBy}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 5, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        className="btn"
                        onClick={() => handlePdf(c)}
                        disabled={exporting === c.id + "-pdf"}
                        title="Export PDF"
                        style={{ fontSize: 11, padding: "4px 9px", display: "flex", alignItems: "center", gap: 4, color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
                      >
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          <line x1={16} y1={13} x2={8} y2={13}/><line x1={16} y1={17} x2={8} y2={17}/><polyline points="10 9 9 9 8 9"/>
                        </svg>
                        {exporting === c.id + "-pdf" ? "…" : "PDF"}
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleExcel(c)}
                        disabled={exporting === c.id + "-xlsx"}
                        title="Export Excel"
                        style={{ fontSize: 11, padding: "4px 9px", display: "flex", alignItems: "center", gap: 4, color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4" }}
                      >
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <rect x={3} y={3} width={18} height={18} rx={2}/><path d="M3 9h18M9 21V9"/>
                        </svg>
                        {exporting === c.id + "-xlsx" ? "…" : "Excel"}
                      </button>
                    </div>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : c.id)}
                      style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: "2px 4px" }}
                    >
                      {isExpanded ? "▲ Hide items" : "▼ Show items"}
                    </button>
                  </div>
                </div>

                {/* Expanded items */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border)", overflow: "auto" }}>
                    <table style={{ fontSize: 11.5, margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ paddingLeft: 16 }}>Product</th>
                          <th>Brand</th>
                          <th style={{ textAlign: "right" }}>System</th>
                          <th style={{ textAlign: "right" }}>Counted</th>
                          <th style={{ textAlign: "right", paddingRight: 16 }}>Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.items.map((item, idx) => {
                          const v = Number(item.variance);
                          return (
                            <tr key={item.id} style={{ background: idx % 2 ? "var(--bg)" : undefined }}>
                              <td style={{ paddingLeft: 16, fontSize: 12, fontWeight: 500 }}>{item.productName}</td>
                              <td style={{ color: "var(--muted)", fontSize: 11 }}>{item.brand ?? "—"}</td>
                              <td style={{ textAlign: "right", color: "var(--muted)" }}>{Number(item.systemQty)}</td>
                              <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(item.countedQty)}</td>
                              <td style={{ textAlign: "right", paddingRight: 16, fontWeight: 700,
                                color: v > 0 ? "#16a34a" : v < 0 ? "#dc2626" : "var(--muted)" }}>
                                {v === 0 ? "—" : (v > 0 ? "+" : "") + v}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StockReportPage() {
  const companyApi = useCompanyApi();
  const navigate = useNavigate();
  const { currentCompany } = useAuth();
  const [rows,         setRows]         = useState<StockRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [filter,       setFilter]       = useState<Filter>("all");
  const [search,       setSearch]       = useState("");
  const [showHistory,  setShowHistory]  = useState(false);

  function load() {
    setLoading(true);
    companyApi.get<StockRow[]>("/stock-report")
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyApi]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "low") list = list.filter((r) => stockStatus(r) === "low");
    if (filter === "out") list = list.filter((r) => stockStatus(r) === "out");
    if (search.trim()) list = list.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [rows, filter, search]);

  const totalValue    = rows.reduce((s, r) => s + r.stockValue, 0);
  const totalProducts = rows.filter((r) => r.isActive).length;
  const outCount      = rows.filter((r) => stockStatus(r) === "out").length;
  const lowCount      = rows.filter((r) => stockStatus(r) === "low").length;

  return (
    <div>
      <div className="page-header">
        <h1>Stock Report</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={load} title="Refresh">↻ Refresh</button>

          {/* History icon button */}
          <IconBtn title="Count history — view all previous stock counts" onClick={() => setShowHistory(true)}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={12} cy={12} r={10} />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </IconBtn>

          {/* Stock Count button */}
          <button
            className="btn"
            onClick={() => navigate("/stock-count")}
            title="Record a new physical stock count"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px" }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Stock Count
          </button>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Stock Value",  value: money(totalValue),      sub: "across all products",  color: "#2454ff" },
          { label: "Active Products",    value: String(totalProducts),  sub: "in catalogue",          color: "#0ea265" },
          { label: "Low Stock Items",    value: String(lowCount),       sub: "at or below reorder",   color: "#d97706" },
          { label: "Out of Stock",       value: String(outCount),       sub: "need restocking",       color: "#dc2626" },
        ].map((c) => (
          <div key={c.label} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: "12px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Search product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220, fontSize: 13 }}
        />
        <div style={{ display: "flex", gap: 6, marginLeft: 4 }}>
          {(["all", "low", "out"] as Filter[]).map((f) => (
            <button
              key={f}
              className="btn"
              onClick={() => setFilter(f)}
              style={filter === f ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : {}}
            >
              {f === "all" ? "All" : f === "low" ? "⚠ Low Stock" : "✕ Out of Stock"}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
          Showing <strong>{filtered.length}</strong> of <strong>{rows.length}</strong>
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Unit</th>
              <th style={{ textAlign: "right" }}>Opening Stock</th>
              <th style={{ textAlign: "right" }}>Purchased</th>
              <th style={{ textAlign: "right" }}>Available</th>
              <th style={{ textAlign: "right" }}>Reorder Level</th>
              <th style={{ textAlign: "right" }}>Unit Price</th>
              <th style={{ textAlign: "right" }}>Stock Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                {rows.length === 0
                  ? "No products yet. Add products from the Products page."
                  : "No products match the current filter."}
              </td></tr>
            )}
            {filtered.map((row) => {
              const st  = stockStatus(row);
              const cfg = STATUS_CFG[st];
              const pct = row.reorderLevel > 0
                ? Math.min((row.available / (row.reorderLevel * 2)) * 100, 100)
                : row.available > 0 ? 100 : 0;
              return (
                <tr key={row.id} style={!row.isActive ? { opacity: 0.5 } : undefined}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{row.name}</div>
                    {row.description && <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.description}</div>}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{row.unit ?? "—"}</td>
                  <td style={{ textAlign: "right", color: "var(--muted)", fontSize: 13 }}>{row.openingStock}</td>
                  <td style={{ textAlign: "right", color: "#2454ff", fontSize: 13, fontWeight: 600 }}>+{row.totalPurchased}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: st === "out" ? "#dc2626" : st === "low" ? "#d97706" : "var(--text)" }}>
                      {row.available}
                    </div>
                    <div style={{ width: 80, height: 4, borderRadius: 2, background: "var(--border)", marginTop: 4, marginLeft: "auto" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: st === "out" ? "#dc2626" : st === "low" ? "#d97706" : "#16a34a", transition: "width 0.3s" }} />
                    </div>
                  </td>
                  <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>
                    {row.reorderLevel > 0 ? row.reorderLevel : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontSize: 13 }}>{money(row.unitPrice)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 14 }}>{money(row.stockValue)}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                <td colSpan={7} style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13 }}>Total Inventory Value</td>
                <td style={{ textAlign: "right", fontWeight: 800, fontSize: 16, color: "#2454ff", padding: "10px 16px" }}>
                  {money(filtered.reduce((s, r) => s + r.stockValue, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* History drawer */}
      <HistoryDrawer open={showHistory} onClose={() => setShowHistory(false)} companyName={currentCompany?.name ?? ""} />
    </div>
  );
}
