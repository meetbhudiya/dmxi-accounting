import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { Invoice, InvoiceStatus } from "../api/types";
import { money, dateOnly } from "../lib/format";
import { ColToggle, useColVis, type ColDef } from "../components/ColToggle";
import { useRegisterNewShortcut } from "../contexts/ShortcutsContext";

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:          { bg: "#f1f5f9", color: "#64748b", label: "Draft" },
  SENT:           { bg: "#eff6ff", color: "#2454ff", label: "Sent" },
  PARTIALLY_PAID: { bg: "#fffbeb", color: "#d97706", label: "Partial" },
  PAID:           { bg: "#f0fdf4", color: "#16a34a", label: "Paid" },
  OVERDUE:        { bg: "#fef2f2", color: "#dc2626", label: "Overdue" },
  VOID:           { bg: "#f8fafc", color: "#94a3b8", label: "Void" },
};

const ALL_STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"];

const INVOICE_COLS: ColDef[] = [
  { key: "number",      label: "Invoice #",    locked: true,  defaultVis: true  },
  { key: "customer",    label: "Customer",     locked: true,  defaultVis: true  },
  { key: "reference",   label: "Reference No", locked: false, defaultVis: false },
  { key: "items",       label: "Items",        locked: false, defaultVis: true  },
  { key: "notes",       label: "Notes",        locked: false, defaultVis: false },
  { key: "issueDate",   label: "Issue Date",   locked: false, defaultVis: true  },
  { key: "dueDate",     label: "Due Date",     locked: false, defaultVis: true  },
  { key: "status",      label: "Status",       locked: false, defaultVis: true  },
  { key: "discount",    label: "Discount %",   locked: false, defaultVis: false },
  { key: "vat",         label: "VAT %",        locked: false, defaultVis: false },
  { key: "amountPaid",  label: "Amount Paid",  locked: false, defaultVis: false },
  { key: "total",       label: "Total",        locked: false, defaultVis: true  },
  { key: "balanceDue",  label: "Balance Due",  locked: false, defaultVis: true  },
];

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
      background: s.bg, color: s.color, textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  );
}

function isOverdue(inv: Invoice) {
  return inv.status !== "PAID" && inv.status !== "VOID" && new Date(inv.dueDate) < new Date();
}

function firstOfYear() { return `${new Date().getFullYear()}-01-01`; }
function today()       { return new Date().toISOString().slice(0, 10); }

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "due_asc";

export default function InvoicesPage() {
  const companyApi = useCompanyApi();
  const navigate   = useNavigate();
  const { currentCompany } = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // ── Column visibility ─────────────────────────────────────────────────────
  const colKey = `dmxi_cols_invoices_${currentCompany?.id ?? ""}`;
  const { vis, toggle, show, visCount } = useColVis(colKey, INVOICE_COLS);
  useRegisterNewShortcut(() => navigate("/invoices/new"));

  // ── List keyboard navigation ──────────────────────────────────────────────
  const [focusIdx,  setFocusIdx]  = useState(-1);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState("");
  const [fromDate,       setFromDate]       = useState(firstOfYear);
  const [toDate,         setToDate]         = useState(today);
  const [statusFilter,   setStatusFilter]   = useState<InvoiceStatus | "">("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [productFilter,  setProductFilter]  = useState("");
  const [sortKey,        setSortKey]        = useState<SortKey>("date_desc");

  function load() {
    setLoading(true);
    companyApi.get<Invoice[]>("/invoices")
      .then(setInvoices)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyApi]);

  // Reset row cursor when filtered list changes
  useEffect(() => { setFocusIdx(-1); rowRefs.current = []; }, [invoices, search, statusFilter, customerFilter, productFilter, fromDate, toDate, sortKey]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusIdx >= 0) rowRefs.current[focusIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  const customerNames = useMemo(
    () => [...new Set(invoices.map((i) => i.customer.name))].sort(),
    [invoices]
  );

  const productNames = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) =>
      inv.items.forEach((item) => { if (item.description) set.add(item.description); })
    );
    return [...set].sort();
  }, [invoices]);

  // ── Filtering + sorting ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = invoices.filter((inv) => {
      const issueD = inv.issueDate.slice(0, 10);
      if (issueD < fromDate || issueD > toDate) return false;
      if (statusFilter && inv.status !== statusFilter) return false;
      if (customerFilter && inv.customer.name !== customerFilter) return false;
      if (productFilter && !inv.items.some((it) => it.description === productFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!inv.number.toLowerCase().includes(q) && !inv.customer.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "date_asc":    return a.issueDate.localeCompare(b.issueDate);
        case "date_desc":   return b.issueDate.localeCompare(a.issueDate);
        case "amount_desc": return Number(b.grandTotal) - Number(a.grandTotal);
        case "amount_asc":  return Number(a.grandTotal) - Number(b.grandTotal);
        case "due_asc":     return a.dueDate.localeCompare(b.dueDate);
        default:            return 0;
      }
    });

    return list;
  }, [invoices, fromDate, toDate, statusFilter, customerFilter, productFilter, search, sortKey]);

  // PageDown / PageUp keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")) return;
      if (e.key === "PageDown") {
        e.preventDefault();
        setFocusIdx((prev) => {
          const next = prev + 1;
          return next >= filtered.length ? filtered.length - 1 : next < 0 ? 0 : next;
        });
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setFocusIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusIdx >= 0 && filtered[focusIdx]) {
        navigate(`/invoices/${filtered[focusIdx].id}`, { state: { ids: filtered.map((i) => i.id), currentIdx: focusIdx } });
      } else if (e.key === "Escape") {
        setFocusIdx(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, focusIdx, navigate]);

  function resetFilters() {
    setSearch(""); setFromDate(firstOfYear()); setToDate(today());
    setStatusFilter(""); setCustomerFilter(""); setProductFilter(""); setSortKey("date_desc");
  }

  const hasActiveFilter = search || statusFilter || customerFilter || productFilter ||
    fromDate !== firstOfYear() || toDate !== today();

  const totalReceivable = invoices.reduce((s, i) => s + Number(i.balanceDue), 0);
  const overdueCount    = invoices.filter(isOverdue).length;
  const paidCount       = invoices.filter((i) => i.status === "PAID").length;
  const filteredTotal   = filtered.reduce((s, i) => s + Number(i.grandTotal), 0);

  // Computed for footer colSpan
  const preAmountCols = INVOICE_COLS
    .filter((c) => c.key !== "total" && c.key !== "balanceDue" && (c.locked || vis[c.key]))
    .length;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <h1>Invoices</h1>
        <button className="btn btn-primary" onClick={() => navigate("/invoices/new")}>
          + New Invoice
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Invoices", value: String(invoices.length),  sub: "all time",      color: "#2454ff" },
          { label: "Receivable",     value: money(totalReceivable),    sub: "outstanding",   color: "#d97706" },
          { label: "Overdue",        value: String(overdueCount),      sub: "past due date", color: "#dc2626" },
          { label: "Paid",           value: String(paidCount),         sub: "fully settled", color: "#16a34a" },
        ].map((c) => (
          <div key={c.label} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>
            Filters
          </span>
          {hasActiveFilter && (
            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 10px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
              onClick={resetFilters}
            >
              ✕ Clear all
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>From</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>To</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Customer</span>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="">All customers</option>
              {customerNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Product / Item</span>
            <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
              <option value="">All products</option>
              {productNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "")}>
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Sort by</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="date_desc">Issue date — newest first</option>
              <option value="date_asc">Issue date — oldest first</option>
              <option value="due_asc">Due date — soonest first</option>
              <option value="amount_desc">Amount — highest first</option>
              <option value="amount_asc">Amount — lowest first</option>
            </select>
          </label>
          <label style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Search</span>
            <input
              placeholder="Number or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Results bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, fontSize: 13 }}>
        <span style={{ color: "var(--muted)" }}>
          Showing <strong>{filtered.length}</strong> of <strong>{invoices.length}</strong> invoice{invoices.length !== 1 ? "s" : ""}
          {hasActiveFilter && <> · filtered total: <strong style={{ color: "#2454ff" }}>{money(filteredTotal)}</strong></>}
        </span>
        <ColToggle cols={INVOICE_COLS} vis={vis} onToggle={toggle} />
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 140 }}>Invoice #</th>
              <th>Customer</th>
              {show("reference")  && <th>Reference No</th>}
              {show("items")      && <th>Items</th>}
              {show("notes")      && <th style={{ width: 160 }}>Notes</th>}
              {show("issueDate")  && <th style={{ width: 110 }}>Issue Date</th>}
              {show("dueDate")    && <th style={{ width: 110 }}>Due Date</th>}
              {show("status")     && <th style={{ width: 110 }}>Status</th>}
              {show("discount")   && <th style={{ width: 90, textAlign: "right" }}>Discount %</th>}
              {show("vat")        && <th style={{ width: 70, textAlign: "right" }}>VAT %</th>}
              {show("amountPaid") && <th style={{ width: 120, textAlign: "right" }}>Amount Paid</th>}
              {show("total")      && <th style={{ width: 130, textAlign: "right" }}>Total</th>}
              {show("balanceDue") && <th style={{ width: 130, textAlign: "right" }}>Balance Due</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={visCount} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={visCount} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                {hasActiveFilter ? "No invoices match the selected filters." : "No invoices yet — create your first one."}
              </td></tr>
            )}
            {filtered.map((inv, idx) => {
              const overdue    = isOverdue(inv);
              const isFocused  = idx === focusIdx;
              const itemSummary = inv.items.slice(0, 2).map((i) => i.description).join(", ")
                + (inv.items.length > 2 ? ` +${inv.items.length - 2} more` : "");
              return (
                <tr
                  key={inv.id}
                  ref={(el) => { rowRefs.current[idx] = el; }}
                  style={{ cursor: "pointer", background: isFocused ? "rgba(36,84,255,0.06)" : undefined, outline: isFocused ? "2px solid #2454ff" : undefined, outlineOffset: "-2px" }}
                  onClick={() => navigate(`/invoices/${inv.id}`, { state: { ids: filtered.map((i) => i.id), currentIdx: idx } })}
                >
                  <td>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#2454ff" }}>
                      {inv.number}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{inv.customer.name}</td>
                  {show("reference")  && <td style={{ fontSize: 12, color: "var(--muted)" }}>{inv.reference ?? "—"}</td>}
                  {show("items")      && (
                    <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {itemSummary}
                    </td>
                  )}
                  {show("notes")      && <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.notes ?? "—"}</td>}
                  {show("issueDate")  && <td style={{ fontSize: 13, color: "var(--muted)" }}>{dateOnly(inv.issueDate)}</td>}
                  {show("dueDate")    && (
                    <td style={{ fontSize: 13, color: overdue ? "#dc2626" : "var(--muted)", fontWeight: overdue ? 600 : undefined }}>
                      {dateOnly(inv.dueDate)}
                      {overdue && <span style={{ fontSize: 10, marginLeft: 4, background: "#fef2f2", color: "#dc2626", padding: "1px 5px", borderRadius: 4 }}>OVERDUE</span>}
                    </td>
                  )}
                  {show("status")     && <td><StatusChip status={inv.status} /></td>}
                  {show("discount")   && <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{Number(inv.discountPercent) > 0 ? `${inv.discountPercent}%` : "—"}</td>}
                  {show("vat")        && <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{Number(inv.vatPercent) > 0 ? `${inv.vatPercent}%` : "—"}</td>}
                  {show("amountPaid") && <td style={{ textAlign: "right", fontWeight: 600, color: "#16a34a" }}>{money(inv.amountPaid)}</td>}
                  {show("total")      && <td style={{ textAlign: "right", fontWeight: 600 }}>{money(inv.grandTotal ?? inv.subtotal)}</td>}
                  {show("balanceDue") && (
                    <td style={{ textAlign: "right", fontWeight: 700, color: Number(inv.balanceDue) > 0 ? "#dc2626" : "#16a34a" }}>
                      {money(inv.balanceDue)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* Footer totals when filtered */}
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "#f8fafc", borderTop: "2px solid var(--border, #e5e7eb)" }}>
                <td colSpan={preAmountCols} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                  {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
                </td>
                {show("amountPaid") && (
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                    {money(filtered.reduce((s, i) => s + Number(i.amountPaid), 0))}
                  </td>
                )}
                {show("total") && (
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>
                    {money(filteredTotal)}
                  </td>
                )}
                {show("balanceDue") && (
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                    {money(filtered.reduce((s, i) => s + Number(i.balanceDue), 0))}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
