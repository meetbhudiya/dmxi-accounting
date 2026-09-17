import { useEffect, useState, useMemo, useCallback, useRef, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { Brand, Purchase, ExpenseStatus, Vendor, Product } from "../api/types";
import { ApiError } from "../api/client";
import Modal from "../components/Modal";
import AttachmentsModal from "../components/AttachmentsModal";
import { money, dateOnly } from "../lib/format";
import { getCurrencySymbol } from "../lib/currency";
import { useRegisterNewShortcut } from "../contexts/ShortcutsContext";

// ── Icons ─────────────────────────────────────────────────────────────────────

const PATHS = {
  total:   "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  paid:    "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  unpaid:  "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  cart:    "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  warn:    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  back:    "M10 19l-7-7m0 0l7-7m-7 7h18",
  plus:    "M12 5v14M5 12h14",
  check:   "M5 13l4 4L19 7",
  trash:   "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  vendor:  "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  cal:     "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  doc:     "M9 12h6m-6 4h6M9 7h6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
};

function SvgIcon({ path, size = 18, stroke = "currentColor", strokeWidth = 1.8 }: {
  path: string; size?: number; stroke?: string; strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { bg: string; color: string; border: string; label: string }> = {
  PAID:      { bg: "#f0fdf6", color: "#16a34a", border: "#bbf7d0", label: "Paid" },
  UNPAID:    { bg: "#fffbeb", color: "#d97706", border: "#fde68a", label: "Unpaid" },
  CANCELLED: { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0", label: "Void" },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.UNPAID;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 11px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function purchaseTotal(p: Purchase) {
  return p.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0);
}

function purchaseLabel(p: Purchase) {
  if (p.items.length === 0) return "—";
  const first = p.items[0].product?.name ?? p.items[0].description ?? "Item";
  return p.items.length === 1 ? first : `${first} + ${p.items.length - 1} more`;
}

// ── Line item types ───────────────────────────────────────────────────────────

interface LineItem {
  brandId:     string;
  productId:   string;
  description: string;
  quantity:    string;
  unitCost:    string;
}

function emptyLine(): LineItem {
  return { brandId: "", productId: "", description: "", quantity: "1", unitCost: "" };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const location = useLocation();
  const isAdmin = currentCompany?.role === "OWNER" || currentCompany?.role === "ADMIN";

  const [purchases,    setPurchases]    = useState<Purchase[]>([]);
  const [vendors,      setVendors]      = useState<Vendor[]>([]);
  const [products,     setProducts]     = useState<Product[]>([]);
  const [brands,       setBrands]       = useState<Brand[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [showNew,      setShowNew]      = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "">("");
  const [brandFilter,  setBrandFilter]  = useState("");
  const [cancelTarget,     setCancelTarget]     = useState<Purchase | null>(null);
  const [attachmentTarget, setAttachmentTarget] = useState<Purchase | null>(null);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [bulkWorking,  setBulkWorking]  = useState(false);
  const [focusIdx,     setFocusIdx]     = useState(-1);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  useRegisterNewShortcut(() => setShowNew(true));
  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) setShowNew(true);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      companyApi.get<Purchase[]>("/purchases"),
      companyApi.get<Vendor[]>("/vendors"),
      companyApi.get<Product[]>("/products"),
      companyApi.get<Brand[]>("/brands"),
    ])
      .then(([p, v, pr, b]) => { setPurchases(p); setVendors(v); setProducts(pr); setBrands(b); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [companyApi]);

  useEffect(load, [load]);

  // ── All hooks must be above any early returns ──────────────────────────────

  const filtered = useMemo(() => {
    let list = purchases;
    if (statusFilter) list = list.filter((p) => p.status === statusFilter);
    if (brandFilter)  list = list.filter((p) => p.items.some((i) => i.product?.brandId === brandFilter));
    return list;
  }, [purchases, statusFilter, brandFilter]);

  useEffect(() => { setFocusIdx(-1); rowRefs.current = []; }, [filtered]);
  useEffect(() => {
    if (focusIdx >= 0) rowRefs.current[focusIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (showNew || cancelTarget || attachmentTarget) return;
      if (e.key === "PageDown") {
        e.preventDefault();
        setFocusIdx((prev) => Math.min(prev < 0 ? 0 : prev + 1, filtered.length - 1));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setFocusIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Escape") {
        setFocusIdx(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, focusIdx, showNew, cancelTarget, attachmentTarget]);

  // ── Full-screen new purchase view ──────────────────────────────────────────
  if (showNew) {
    return (
      <NewPurchaseView
        vendors={vendors} products={products} brands={brands}
        onBack={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); load(); }}
      />
    );
  }

  // ── List view actions ──────────────────────────────────────────────────────

  async function toggleStatus(purchase: Purchase) {
    if (purchase.status === "CANCELLED") return;
    const next: "PAID" | "UNPAID" = purchase.status === "PAID" ? "UNPAID" : "PAID";
    try {
      const updated = await companyApi.patch<Purchase>(`/purchases/${purchase.id}/status`, { status: next });
      setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update purchase");
    }
  }

  async function handleDelete(purchase: Purchase) {
    if (!window.confirm(`Permanently delete ${purchase.voucherNo ?? "this purchase"}? This cannot be undone.`)) return;
    try {
      await companyApi.del(`/purchases/${purchase.id}`);
      setPurchases((prev) => prev.filter((p) => p.id !== purchase.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete purchase");
    }
  }

  async function handleBulkStatus(status: "PAID" | "UNPAID") {
    if (!selected.size) return;
    setBulkWorking(true);
    try {
      const updates = await Promise.all(
        [...selected].map((id) => companyApi.patch<Purchase>(`/purchases/${id}/status`, { status }))
      );
      setPurchases((prev) => prev.map((p) => updates.find((u) => u.id === p.id) ?? p));
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk update failed");
    } finally { setBulkWorking(false); }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleSelectAll() {
    const eligible = filtered.filter((p) => p.status !== "CANCELLED").map((p) => p.id);
    setSelected((prev) => prev.size === eligible.length ? new Set() : new Set(eligible));
  }

  const active      = purchases.filter((p) => p.status !== "CANCELLED");
  const totalAll    = active.reduce((s, p) => s + purchaseTotal(p), 0);
  const totalPaid   = active.filter((p) => p.status === "PAID").reduce((s, p) => s + purchaseTotal(p), 0);
  const totalUnpaid = active.filter((p) => p.status === "UNPAID").reduce((s, p) => s + purchaseTotal(p), 0);

  const KPI = [
    { label: "Total Purchases", value: money(totalAll),          sub: "active only",   icon: "total"  as const, color: "#2454ff", bg: "#eef2ff", accent: "#2454ff" },
    { label: "Paid",            value: money(totalPaid),         sub: "fully settled", icon: "paid"   as const, color: "#16a34a", bg: "#f0fdf4", accent: "#16a34a" },
    { label: "Unpaid",          value: money(totalUnpaid),       sub: "outstanding",   icon: "unpaid" as const, color: "#d97706", bg: "#fffbeb", accent: "#f59e0b" },
    { label: "Transactions",    value: String(purchases.length), sub: "all incl. void",icon: "cart"   as const, color: "#64748b", bg: "#f1f5f9", accent: "#94a3b8" },
  ];

  const statusPills: { value: ExpenseStatus | ""; label: string }[] = [
    { value: "", label: "All" },
    { value: "UNPAID", label: "Unpaid" },
    { value: "PAID", label: "Paid" },
    { value: "CANCELLED", label: "Void" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1829 0%, #162040 100%)",
        borderRadius: 16, padding: "24px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -30, top: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(36,84,255,0.1)", pointerEvents: "none" }} />
        <div>
          <div style={{ fontSize: 12, color: "#4a5a72", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5 }}>Inventory</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.4px" }}>Purchases</h1>
          <div style={{ fontSize: 13, color: "#4a5a72", marginTop: 4 }}>
            {active.length} active · {purchases.filter(p => p.status === "CANCELLED").length} void
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ fontSize: 13, padding: "10px 20px", gap: 8 }}>
          <SvgIcon path={PATHS.cart} size={15} />
          New Purchase
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {KPI.map((c) => (
          <div key={c.label} className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, transition: "transform 0.15s, box-shadow 0.15s" }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 8px 24px rgb(0 0 0 / 0.09)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.transform = ""; el.style.boxShadow = ""; }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>{c.value}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{c.sub}</div>
              </div>
              <div style={{ background: c.bg, color: c.color, borderRadius: 10, padding: 10, flexShrink: 0 }}>
                <SvgIcon path={PATHS[c.icon]} size={20} />
              </div>
            </div>
            <div style={{ height: 3, borderRadius: 99, background: `linear-gradient(90deg, ${c.accent} 0%, ${c.bg} 100%)` }} />
          </div>
        ))}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 10, padding: 3 }}>
          {statusPills.map((p) => (
            <button key={p.value} onClick={() => { setStatusFilter(p.value); setSelected(new Set()); }}
              style={{
                border: "none", borderRadius: 7, padding: "5px 14px",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: statusFilter === p.value ? "var(--surface)" : "transparent",
                color: statusFilter === p.value ? "var(--primary)" : "var(--muted)",
                boxShadow: statusFilter === p.value ? "0 1px 4px rgb(0 0 0 / 0.08)" : "none",
                transition: "all 0.12s",
              }}
            >{p.label}</button>
          ))}
        </div>

        {brands.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Brand</span>
            <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setSelected(new Set()); }} style={{ width: 160, fontSize: 12 }}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {(statusFilter || brandFilter) && (
          <button className="btn" style={{ fontSize: 11, padding: "4px 12px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
            onClick={() => { setStatusFilter(""); setBrandFilter(""); }}>✕ Clear</button>
        )}

        {selected.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4, paddingLeft: 14, borderLeft: "1.5px solid var(--border)" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>{selected.size} selected</span>
            <button className="btn" style={{ fontSize: 11, padding: "4px 12px", color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4" }}
              onClick={() => handleBulkStatus("PAID")} disabled={bulkWorking}>Mark Paid</button>
            <button className="btn" style={{ fontSize: 11, padding: "4px 12px", color: "#d97706", borderColor: "#fde68a", background: "#fffbeb" }}
              onClick={() => handleBulkStatus("UNPAID")} disabled={bulkWorking}>Mark Unpaid</button>
            <button className="btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setSelected(new Set())}>✕</button>
          </div>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> / {purchases.length}
        </span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40, padding: "11px 8px 11px 18px" }}>
                <input type="checkbox" style={{ cursor: "pointer" }}
                  checked={selected.size > 0 && selected.size === filtered.filter((p) => p.status !== "CANCELLED").length}
                  onChange={toggleSelectAll} />
              </th>
              <th style={{ width: 148 }}>Voucher</th>
              <th style={{ width: 100 }}>Date</th>
              <th>Items</th>
              <th style={{ width: 130 }}>Brand</th>
              <th style={{ width: 140 }}>Vendor</th>
              <th style={{ width: 130, textAlign: "right" }}>Total</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: isAdmin ? 200 : 130 }} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>Loading purchases…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "48px 0" }}>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 6 }}>
                    {statusFilter || brandFilter ? "No purchases match the current filter." : "No purchases recorded yet."}
                  </div>
                  {!statusFilter && !brandFilter && (
                    <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ fontSize: 12, marginTop: 4 }}>+ New Purchase</button>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((pur, idx) => {
              const isVoid     = pur.status === "CANCELLED";
              const isSelected = selected.has(pur.id);
              const isFocused  = idx === focusIdx;
              const total      = purchaseTotal(pur);
              const label      = purchaseLabel(pur);
              const brandNames = [...new Set(pur.items.map((i) => i.product?.brand?.name).filter(Boolean))];
              return (
                <tr key={pur.id} ref={(el) => { rowRefs.current[idx] = el; }}
                  style={{ opacity: isVoid ? 0.5 : 1, background: isFocused ? "#eef4ff" : isSelected ? "rgba(36,84,255,0.04)" : undefined, outline: isFocused ? "2px solid #2454ff" : undefined, outlineOffset: isFocused ? "-2px" : undefined }}>
                  <td style={{ padding: "10px 8px 10px 18px" }}>
                    {!isVoid && <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(pur.id)} onClick={(e) => e.stopPropagation()} style={{ cursor: "pointer" }} />}
                  </td>
                  <td>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, background: isVoid ? "var(--bg)" : "#eef2ff", color: isVoid ? "var(--muted)" : "#2454ff", borderRadius: 6, padding: "3px 8px", letterSpacing: "0.02em" }}>
                      {pur.voucherNo ?? "—"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500 }}>{isVoid ? "—" : dateOnly(pur.date)}</td>
                  <td>
                    {isVoid ? <span style={{ color: "var(--muted)" }}>—</span> : (
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{label}</span>
                        {pur.items.length > 1 && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#eef2ff", color: "#2454ff", borderRadius: 99, padding: "2px 8px" }}>{pur.items.length} items</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {!isVoid && brandNames.length > 0 ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {brandNames.map((n) => (
                          <span key={n} style={{ fontSize: 11, fontWeight: 700, background: "#eef2ff", color: "#2454ff", borderRadius: 99, padding: "3px 9px", border: "1px solid #c7d7ff" }}>{n}</span>
                        ))}
                      </div>
                    ) : <span style={{ color: "var(--muted)", fontSize: 13 }}>—</span>}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{isVoid ? "—" : (pur.vendor?.name ?? "—")}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 13.5, textDecoration: isVoid ? "line-through" : undefined }}>{money(total)}</td>
                  <td><StatusChip status={pur.status} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", paddingRight: 6 }}>
                      {!isVoid && (
                        <>
                          <button className="btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => toggleStatus(pur)}>
                            {pur.status === "PAID" ? "Mark Unpaid" : "Mark Paid"}
                          </button>
                          <button className="btn" style={{ fontSize: 11, padding: "4px 10px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }} onClick={() => setCancelTarget(pur)}>
                            Cancel
                          </button>
                        </>
                      )}
                      <button
                        className="btn"
                        title="Reference images & attachments"
                        style={{ fontSize: 11, padding: "4px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}
                        onClick={(e) => { e.stopPropagation(); setAttachmentTarget(pur); }}
                      >
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                        </svg>
                        Attach
                      </button>
                      {isAdmin && (
                        <button className="btn" style={{ fontSize: 11, padding: "4px 10px", color: "#dc2626", borderColor: "#fca5a5" }} onClick={() => handleDelete(pur)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (() => {
            const activeFilt = filtered.filter((p) => p.status !== "CANCELLED");
            return (
              <tfoot>
                <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={5} style={{ padding: "11px 18px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                    {activeFilt.length} active purchase{activeFilt.length !== 1 ? "s" : ""}
                  </td>
                  <td /><td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 800, fontSize: 14, color: "var(--text)" }}>
                    {money(activeFilt.reduce((s, p) => s + purchaseTotal(p), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>

      {/* ── Cancel modal ───────────────────────────────────────────────────── */}
      {cancelTarget && (
        <CancelPurchaseModal
          purchase={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={(updated) => { setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p))); setCancelTarget(null); }}
        />
      )}

      {/* ── Attachments modal ──────────────────────────────────────────────── */}
      {attachmentTarget && (
        <AttachmentsModal
          entityType="purchase"
          entityId={attachmentTarget.id}
          title={attachmentTarget.voucherNo ?? attachmentTarget.id}
          onClose={() => setAttachmentTarget(null)}
        />
      )}
    </div>
  );
}

// ── Cancel modal ──────────────────────────────────────────────────────────────

function CancelPurchaseModal({ purchase, onClose, onCancelled }: {
  purchase: Purchase; onClose: () => void; onCancelled: (p: Purchase) => void;
}) {
  const companyApi = useCompanyApi();
  const [reason, setReason] = useState("");
  const [error,  setError]  = useState<string | null>(null);
  const [busy,   setBusy]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const updated = await companyApi.post<Purchase>(`/purchases/${purchase.id}/cancel`, { reason: reason || undefined });
      onCancelled(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Cancel Purchase" onClose={onClose} maxWidth={440}>
      <div style={{ background: "#fff8f0", border: "1px solid #fed7aa", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }}><SvgIcon path={PATHS.warn} size={18} /></div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 3 }}>
            {purchase.voucherNo ?? purchase.id.slice(0, 8)} · {purchaseLabel(purchase)}
          </div>
          <div style={{ fontSize: 12.5, color: "#b45309" }}>{money(purchaseTotal(purchase))} · {dateOnly(purchase.date)}</div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
        A reversal journal entry will be posted. This voucher will remain visible as <strong>VOID</strong> in reports.
      </p>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label style={{ textTransform: "none", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Reason <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered in error, duplicate…" />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Keep</button>
          <button type="submit" className="btn" disabled={busy} style={{ background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca", fontWeight: 700 }}>
            {busy ? "Cancelling…" : "Confirm Cancel"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Full-screen New Purchase view ─────────────────────────────────────────────

function NewPurchaseView({ vendors, products, brands, onBack, onCreated }: {
  vendors: Vendor[]; products: Product[]; brands: Brand[];
  onBack: () => void; onCreated: () => void;
}) {
  const companyApi = useCompanyApi();
  const [vendorId,   setVendorId]   = useState("");
  const [date,       setDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [status,     setStatus]     = useState<"UNPAID" | "PAID">("UNPAID");
  const [reference,  setReference]  = useState("");
  const [vatPct,     setVatPct]     = useState(16);
  const [lines,      setLines]      = useState<LineItem[]>([emptyLine()]);
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const formRef    = useRef<HTMLFormElement>(null);

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function onBrandChange(i: number, brandId: string) { updateLine(i, { brandId, productId: "", unitCost: "" }); }
  function onProductChange(i: number, productId: string) {
    const p = products.find((pr) => pr.id === productId);
    updateLine(i, { productId, unitCost: p ? String(p.unitPrice) : lines[i].unitCost });
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      const inputs = formRef.current?.querySelectorAll<HTMLElement>("input,select");
      if (inputs) inputs[inputs.length - 1]?.focus();
    }, 60);
  }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  const subtotal   = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const vatAmt     = (subtotal * vatPct) / 100;
  const grandTotal = subtotal + vatAmt;
  const hasBrands  = brands.length > 0;
  const lineCount  = lines.length;
  const selectedVendor = vendors.find(v => v.id === vendorId);

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
    e.preventDefault();

    // If pressing Enter on last unitCost input of last row → add new line
    const allInputs = Array.from(formRef.current?.querySelectorAll<HTMLElement>("input,select") ?? []);
    const idx = allInputs.indexOf(target);
    const isLast = idx === allInputs.length - 1 || idx === allInputs.length - 2;
    if ((target as HTMLInputElement).name === "unitCost" && isLast) {
      addLine(); return;
    }

    // Otherwise advance to next focusable field
    if (idx >= 0 && idx < allInputs.length - 1) allInputs[idx + 1].focus();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const items = lines.map((l) => ({
      productId:   l.productId   || undefined,
      description: l.description || undefined,
      quantity:    Number(l.quantity),
      unitCost:    Number(l.unitCost),
    }));
    if (items.some((it) => !it.quantity || (!it.productId && !it.description))) {
      setError("Each line needs a product or description and a quantity."); return;
    }
    if (items.some((it) => !it.unitCost || isNaN(it.unitCost))) {
      setError("Each line needs a unit cost greater than 0."); return;
    }
    setSubmitting(true);
    try {
      await companyApi.post("/purchases", {
        vendorId: vendorId || undefined, reference: reference || undefined,
        date, status, vatPercent: vatPct, items,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create purchase");
    } finally { setSubmitting(false); }
  }

  const inputStyle: React.CSSProperties = { fontSize: 13.5 };
  const labelStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 };

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 0 18px 0",
        borderBottom: "1.5px solid var(--border)",
        marginBottom: 24,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 10,
              border: "1.5px solid var(--border)", background: "var(--surface)",
              cursor: "pointer", color: "var(--muted)",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--bg)"; el.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--surface)"; el.style.color = "var(--muted)"; }}
          >
            <SvgIcon path={PATHS.back} size={16} strokeWidth={2.2} />
          </button>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>
              Purchases /
              <span style={{ color: "var(--primary)", marginLeft: 5 }}>New</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.4px" }}>
              New Purchase Entry
            </h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={onBack} style={{ fontSize: 13 }}>Discard</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || grandTotal === 0}
            style={{ fontSize: 13, padding: "9px 22px", gap: 8 }}
          >
            <SvgIcon path={PATHS.check} size={14} strokeWidth={2.5} />
            {submitting ? "Saving…" : "Save Purchase"}
          </button>
        </div>
      </div>

      {/* ── Body: two-column layout ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0, alignItems: "flex-start" }}>

        {/* ── Left: Line items ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Line Items</span>
              <span style={{ background: "#eef2ff", color: "#2454ff", borderRadius: 99, fontSize: 11, fontWeight: 800, padding: "2px 9px" }}>
                {lineCount}
              </span>
            </div>
            <button
              type="button"
              onClick={addLine}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                border: "1.5px dashed #2454ff", background: "transparent",
                color: "#2454ff", borderRadius: 8, padding: "6px 14px",
                fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#eef2ff"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <SvgIcon path={PATHS.plus} size={13} strokeWidth={2.5} />
              Add Line
            </button>
          </div>

          {/* Line cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lines.map((line, i) => {
              const brandProducts = line.brandId ? products.filter((p) => p.brandId === line.brandId) : products;
              const lineTotal     = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);

              return (
                <div key={i} className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid var(--border)" }}>

                  {/* Card top bar */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px",
                    background: "var(--bg)",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: 7,
                        background: "linear-gradient(135deg,#2454ff,#173bcc)",
                        color: "#fff", fontSize: 11, fontWeight: 800,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500 }}>
                        {line.productId
                          ? products.find(p => p.id === line.productId)?.name ?? "Product"
                          : line.description
                            ? line.description
                            : "New line item"}
                        {line.brandId && (
                          <span style={{ marginLeft: 7, background: "#eef2ff", color: "#2454ff", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "2px 7px" }}>
                            {brands.find(b => b.id === line.brandId)?.name}
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {lineTotal > 0 && (
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#2454ff", letterSpacing: "-0.2px" }}>{money(lineTotal)}</span>
                      )}
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          title="Remove line"
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: 7,
                            border: "1.5px solid var(--border)", background: "var(--surface)",
                            cursor: "pointer", color: "var(--muted)",
                            transition: "all 0.12s",
                          }}
                          onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "#fef2f2"; el.style.color = "#dc2626"; el.style.borderColor = "#fecaca"; }}
                          onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--surface)"; el.style.color = "var(--muted)"; el.style.borderColor = "var(--border)"; }}
                        >
                          <SvgIcon path={PATHS.trash} size={13} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card fields */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: hasBrands ? "160px 1fr 100px 150px" : "1fr 100px 150px",
                    gap: 0,
                  }}>
                    {hasBrands && (
                      <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
                        <div style={labelStyle}>Brand</div>
                        <select value={line.brandId} onChange={(e) => onBrandChange(i, e.target.value)} style={inputStyle}>
                          <option value="">All brands</option>
                          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    )}

                    <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
                      <div style={labelStyle}>Product / Description</div>
                      <select value={line.productId} onChange={(e) => onProductChange(i, e.target.value)} style={inputStyle}>
                        <option value="">— custom item —</option>
                        {brandProducts.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.unit ? ` (${p.unit})` : ""}</option>
                        ))}
                      </select>
                      {!line.productId && (
                        <input
                          value={line.description}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                          placeholder="Type item description…"
                          style={{ ...inputStyle, marginTop: 8 }}
                        />
                      )}
                    </div>

                    <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
                      <div style={labelStyle}>Qty</div>
                      <input
                        type="number" min="0.001" step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                        required
                        style={{ ...inputStyle, textAlign: "right", fontWeight: 700 }}
                      />
                    </div>

                    <div style={{ padding: "14px 16px" }}>
                      <div style={labelStyle}>Unit Cost</div>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--muted)", fontWeight: 600, pointerEvents: "none" }}>{getCurrencySymbol()}</span>
                        <input
                          type="number" min="0" step="any"
                          name="unitCost"
                          value={line.unitCost}
                          onChange={(e) => updateLine(i, { unitCost: e.target.value })}
                          required placeholder="0.00"
                          style={{ ...inputStyle, textAlign: "right", fontWeight: 700, paddingLeft: 22 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Add line button — bottom shortcut */}
          <button
            type="button"
            onClick={addLine}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px", border: "1.5px dashed var(--border)",
              borderRadius: 12, background: "transparent",
              color: "var(--muted)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              transition: "border-color 0.12s, color 0.12s, background 0.12s",
            }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#2454ff"; el.style.color = "#2454ff"; el.style.background = "#f5f8ff"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.color = "var(--muted)"; el.style.background = "transparent"; }}
          >
            <SvgIcon path={PATHS.plus} size={15} strokeWidth={2.5} />
            Add another line
          </button>

          {error && <div className="error-text">{error}</div>}
        </div>

        {/* ── Right: Details + Summary ──────────────────────────────────────── */}
        <div style={{ width: 290, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Purchase details card */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Purchase Details</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Vendor */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, ...labelStyle }}>
                  <SvgIcon path={PATHS.vendor} size={12} strokeWidth={2} />
                  Vendor
                </div>
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={inputStyle}>
                  <option value="">— No vendor —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              {/* Date */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, ...labelStyle }}>
                  <SvgIcon path={PATHS.cal} size={12} strokeWidth={2} />
                  Date
                </div>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
              </div>

              {/* Reference */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, ...labelStyle }}>
                  <SvgIcon path={PATHS.doc} size={12} strokeWidth={2} />
                  Reference / PO
                </div>
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO-2026-001" style={inputStyle} />
              </div>

              {/* Payment status toggle */}
              <div>
                <div style={labelStyle}>Payment Status</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderRadius: 9, overflow: "hidden", border: "1.5px solid var(--border)" }}>
                  {(["UNPAID", "PAID"] as const).map((s, idx) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      style={{
                        border: "none",
                        borderRight: idx === 0 ? "1px solid var(--border)" : "none",
                        padding: "10px 0",
                        fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                        background: status === s
                          ? s === "PAID"
                            ? "linear-gradient(135deg,#16a34a,#15803d)"
                            : "linear-gradient(135deg,#d97706,#b45309)"
                          : "var(--surface)",
                        color: status === s ? "#fff" : "var(--muted)",
                        transition: "all 0.15s",
                      }}
                    >
                      {s === "PAID" ? "✓ Paid" : "⏳ Unpaid"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Summary card */}
          <div style={{
            background: "linear-gradient(160deg, #0d1117 0%, #0f1d38 100%)",
            borderRadius: 14, padding: 20,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5a72", textTransform: "uppercase", letterSpacing: "0.07em" }}>Summary</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Lines</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0" }}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Vendor</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0" }}>
                  {selectedVendor ? selectedVendor.name : <span style={{ color: "#2e3a52", fontStyle: "italic" }}>None</span>}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Status</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
                  padding: "3px 10px", borderRadius: 99,
                  background: status === "PAID" ? "rgba(22,163,74,0.15)" : "rgba(217,119,6,0.15)",
                  color: status === "PAID" ? "#4ade80" : "#fbbf24",
                }}>
                  {status === "PAID" ? "PAID" : "UNPAID"}
                </span>
              </div>
              <div style={{ height: 1, background: "#1e2d45" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Subtotal</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0" }}>{money(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#4a5a72", flexShrink: 0 }}>VAT %</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" min="0" max="100" step="any"
                    value={vatPct}
                    onChange={(e) => setVatPct(parseFloat(e.target.value) || 0)}
                    style={{
                      width: 56, textAlign: "right", fontSize: 12, fontWeight: 700,
                      background: "#1a2540", border: "1px solid #2e3f60",
                      borderRadius: 6, color: "#8fa3c0", padding: "4px 8px",
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0", minWidth: 70, textAlign: "right" }}>{money(vatAmt)}</span>
                </div>
              </div>
              <div style={{ height: 1, background: "#1e2d45" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: "#8fa3c0", fontWeight: 600 }}>Total</span>
                <span style={{
                  fontSize: 28, fontWeight: 900, letterSpacing: "-0.8px",
                  color: grandTotal > 0 ? "#fff" : "#2e3a52",
                  transition: "color 0.2s",
                }}>
                  {money(grandTotal)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || grandTotal === 0}
              style={{
                width: "100%", padding: "12px",
                background: grandTotal > 0
                  ? "linear-gradient(135deg,#2454ff,#173bcc)"
                  : "rgba(255,255,255,0.06)",
                border: "none", borderRadius: 10,
                color: grandTotal > 0 ? "#fff" : "#2e3a52",
                fontSize: 14, fontWeight: 800, cursor: grandTotal > 0 ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: grandTotal > 0 ? "0 4px 16px rgb(36 84 255 / 0.4)" : "none",
              }}
            >
              {submitting ? "Saving…" : (
                <>
                  <SvgIcon path={PATHS.check} size={15} strokeWidth={2.5} />
                  Save Purchase
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
