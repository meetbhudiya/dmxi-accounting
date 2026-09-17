import { useEffect, useState, useMemo, useRef, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { Expense, ExpenseStatus, Vendor } from "../api/types";
import { ApiError } from "../api/client";
import Modal from "../components/Modal";
import AttachmentsModal from "../components/AttachmentsModal";
import { money, dateOnly } from "../lib/format";
import { useRegisterNewShortcut } from "../contexts/ShortcutsContext";

const RECURRING_KEY = "dmxi_recurring_expenses";
function loadRecurring(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(RECURRING_KEY) ?? "[]")); } catch { return new Set(); }
}
function saveRecurring(s: Set<string>) {
  localStorage.setItem(RECURRING_KEY, JSON.stringify([...s]));
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  PAID:      { bg: "#f0fdf4", color: "#16a34a", label: "Paid" },
  UNPAID:    { bg: "#fffbeb", color: "#d97706", label: "Unpaid" },
  CANCELLED: { bg: "#f1f5f9", color: "#94a3b8", label: "Void" },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.UNPAID;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
      background: s.bg, color: s.color, textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

const EXPENSE_CATEGORIES = [
  "Salary", "Rent", "Utilities", "Insurance",
  "Transport", "Marketing", "Office Supplies", "Other",
];

export default function ExpensesPage() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const location = useLocation();
  const isAdmin = currentCompany?.role === "OWNER" || currentCompany?.role === "ADMIN";

  const [expenses,     setExpenses]     = useState<Expense[]>([]);
  const [vendors,      setVendors]      = useState<Vendor[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [showModal,    setShowModal]    = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "">("");
  const [cancelTarget,     setCancelTarget]     = useState<Expense | null>(null);
  const [attachmentTarget, setAttachmentTarget] = useState<Expense | null>(null);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [bulkWorking,  setBulkWorking]  = useState(false);
  const [recurring,    setRecurring]    = useState<Set<string>>(loadRecurring);
  const [focusIdx,     setFocusIdx]     = useState(-1);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  useRegisterNewShortcut(() => setShowModal(true));

  function load() {
    setLoading(true);
    Promise.all([companyApi.get<Expense[]>("/expenses"), companyApi.get<Vendor[]>("/vendors")])
      .then(([exp, vend]) => { setExpenses(exp); setVendors(vend); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyApi]);
  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) setShowModal(true);
  }, []);

  const filtered = useMemo(() =>
    statusFilter ? expenses.filter((e) => e.status === statusFilter) : expenses,
  [expenses, statusFilter]);

  useEffect(() => { setFocusIdx(-1); rowRefs.current = []; }, [filtered]);
  useEffect(() => {
    if (focusIdx >= 0) rowRefs.current[focusIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (showModal || cancelTarget || attachmentTarget) return;
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
  }, [filtered, focusIdx, showModal, cancelTarget, attachmentTarget]);

  async function toggleStatus(expense: Expense) {
    if (expense.status === "CANCELLED") return;
    const next: ExpenseStatus = expense.status === "PAID" ? "UNPAID" : "PAID";
    try {
      const updated = await companyApi.patch<Expense>(`/expenses/${expense.id}/status`, { status: next });
      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update expense");
    }
  }

  async function handleDelete(expense: Expense) {
    if (!window.confirm(`Permanently delete ${expense.voucherNo ?? "this expense"}? This cannot be undone.`)) return;
    try {
      await companyApi.del(`/expenses/${expense.id}`);
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete expense");
    }
  }

  async function handleBulkStatus(status: "PAID" | "UNPAID") {
    if (!selected.size) return;
    setBulkWorking(true);
    try {
      const updates = await Promise.all(
        [...selected].map((id) => companyApi.patch<Expense>(`/expenses/${id}/status`, { status }))
      );
      setExpenses((prev) => prev.map((e) => updates.find((u) => u.id === e.id) ?? e));
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk update failed");
    } finally {
      setBulkWorking(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleRecurring(id: string) {
    setRecurring((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      saveRecurring(s);
      return s;
    });
  }

  function toggleSelectAll() {
    const eligible = filtered.filter((e) => e.status !== "CANCELLED").map((e) => e.id);
    setSelected((prev) => prev.size === eligible.length ? new Set() : new Set(eligible));
  }

  const active    = expenses.filter((e) => e.status !== "CANCELLED");
  const totalAll   = active.reduce((s, e) => s + Number(e.amount), 0);
  const totalPaid  = active.filter((e) => e.status === "PAID").reduce((s, e) => s + Number(e.amount), 0);
  const totalUnpaid = active.filter((e) => e.status === "UNPAID").reduce((s, e) => s + Number(e.amount), 0);

  if (showModal) {
    return (
      <NewExpenseView
        vendors={vendors}
        onBack={() => setShowModal(false)}
        onCreated={(id, isRecurring) => {
          setShowModal(false);
          if (isRecurring) {
            setRecurring((prev) => { const s = new Set(prev); s.add(id); saveRecurring(s); return s; });
          }
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Expenses</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Expense</button>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* Recurring reminder banner */}
      {(() => {
        const thisMonth = new Date().toISOString().slice(0, 7);
        const due = expenses.filter((e) =>
          e.status === "UNPAID" && recurring.has(e.id) &&
          e.date.slice(0, 7) <= thisMonth
        );
        if (!due.length) return null;
        return (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, background: "var(--surface, #fff)", border: "1px solid var(--border)", borderLeft: "4px solid #f59e0b", borderRadius: 10, padding: "14px 20px", marginBottom: 16 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>↻</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e", marginBottom: 3 }}>
                {due.length} recurring expense{due.length !== 1 ? "s" : ""} unpaid this month
              </div>
              <div style={{ fontSize: 12, color: "#b45309" }}>
                {due.map((e) => `${e.category}${e.vendor?.name ? ` · ${e.vendor.name}` : ""} (${money(e.amount)})`).join(" — ")}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Expenses",  value: money(totalAll),    sub: "active only",   color: "#2454ff" },
          { label: "Paid",            value: money(totalPaid),   sub: "fully settled", color: "#16a34a" },
          { label: "Unpaid",          value: money(totalUnpaid), sub: "outstanding",   color: "#dc2626" },
          { label: "Transactions",    value: String(expenses.length), sub: "all incl. void", color: "#6b7785" },
        ].map((c) => (
          <div key={c.label} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter + bulk action bar */}
      <div className="card" style={{ padding: "12px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter</span>
        <label style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>Status</span>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as ExpenseStatus | ""); setSelected(new Set()); }} style={{ width: 140 }}>
            <option value="">All</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Void</option>
          </select>
        </label>
        {statusFilter && (
          <button className="btn" style={{ fontSize: 11, padding: "3px 10px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
            onClick={() => setStatusFilter("")}>✕ Clear</button>
        )}
        {selected.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8, paddingLeft: 12, borderLeft: "1px solid var(--border)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--primary, #2454ff)" }}>{selected.size} selected</span>
            <button className="btn" style={{ fontSize: 11, padding: "4px 12px", color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4" }}
              onClick={() => handleBulkStatus("PAID")} disabled={bulkWorking}>Mark Paid</button>
            <button className="btn" style={{ fontSize: 11, padding: "4px 12px", color: "#d97706", borderColor: "#fde68a", background: "#fffbeb" }}
              onClick={() => handleBulkStatus("UNPAID")} disabled={bulkWorking}>Mark Unpaid</button>
            <button className="btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setSelected(new Set())}>✕</button>
          </div>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
          Showing <strong>{filtered.length}</strong> of <strong>{expenses.length}</strong>
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 36, padding: "10px 8px 10px 16px" }}>
                <input type="checkbox" style={{ cursor: "pointer" }}
                  checked={selected.size > 0 && selected.size === filtered.filter((e) => e.status !== "CANCELLED").length}
                  onChange={toggleSelectAll} />
              </th>
              <th style={{ width: 150 }}>Vch No</th>
              <th style={{ width: 110 }}>Date</th>
              <th>Category</th>
              <th>Vendor</th>
              <th>Description / Reason</th>
              <th style={{ width: 130, textAlign: "right" }}>Amount</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: isAdmin ? 210 : 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                {statusFilter ? "No expenses match the filter." : "No expenses recorded yet."}
              </td></tr>
            )}
            {filtered.map((exp, idx) => {
              const isVoid = exp.status === "CANCELLED";
              const isSelected = selected.has(exp.id);
              const isFocused = idx === focusIdx;
              const rowStyle = isFocused
                ? { background: "#eef4ff", outline: "2px solid #2454ff", outlineOffset: "-2px" }
                : isVoid ? { opacity: 0.55, background: "var(--bg, #f8fafc)" }
                : isSelected ? { background: "var(--primary, #2454ff)0d" } : undefined;
              return (
                <tr key={exp.id} ref={(el) => { rowRefs.current[idx] = el; }} style={rowStyle}>
                  <td style={{ padding: "8px 8px 8px 16px" }}>
                    {!isVoid && (
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(exp.id)} style={{ cursor: "pointer" }} onClick={(e) => e.stopPropagation()} />
                    )}
                  </td>
                  <td>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: isVoid ? "var(--muted)" : "var(--primary, #2454ff)" }}>
                      {exp.voucherNo ?? "—"}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{isVoid ? "—" : dateOnly(exp.date)}</td>
                  <td style={{ fontWeight: 500, color: isVoid ? "var(--muted)" : undefined }}>{isVoid ? "—" : exp.category}</td>
                  <td style={{ color: "var(--muted)" }}>{isVoid ? "—" : (exp.vendor?.name ?? "—")}</td>
                  <td style={{ fontSize: 13, color: "var(--muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isVoid
                      ? (exp.cancelReason ?? exp.description ?? "—")
                      : (exp.description ?? "—")}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600, textDecoration: isVoid ? "line-through" : undefined, color: isVoid ? "var(--muted)" : undefined }}>
                    {money(exp.amount)}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StatusChip status={exp.status} />
                      {recurring.has(exp.id) && (
                        <span title="Recurring expense" style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#eff6ff", color: "#3b82f6", border: "1px solid #bfdbfe", letterSpacing: "0.04em", cursor: "default" }}>
                          ↻ REC
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {!isVoid && (
                        <>
                          <button className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => toggleStatus(exp)}>
                            Mark {exp.status === "PAID" ? "Unpaid" : "Paid"}
                          </button>
                          <button
                            className="btn"
                            style={{
                              fontSize: 11, padding: "3px 9px",
                              display: "inline-flex", alignItems: "center", gap: 4,
                              color: recurring.has(exp.id) ? "#2563eb" : "var(--muted)",
                              borderColor: recurring.has(exp.id) ? "#93c5fd" : "var(--border)",
                              background: recurring.has(exp.id) ? "#eff6ff" : "var(--bg)",
                              fontWeight: recurring.has(exp.id) ? 700 : 400,
                            }}
                            onClick={() => toggleRecurring(exp.id)}
                            title={recurring.has(exp.id) ? "Remove recurring flag" : "Mark as recurring"}
                          >
                            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                            </svg>
                            Recurring
                          </button>
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: "3px 8px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
                            onClick={() => setCancelTarget(exp)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <button
                        className="btn"
                        title="Reference images & attachments"
                        style={{ fontSize: 11, padding: "3px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}
                        onClick={() => setAttachmentTarget(exp)}
                      >
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                        </svg>
                        Attach
                      </button>
                      {isAdmin && (
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: "3px 8px", color: "#dc2626", borderColor: "#dc2626" }}
                          onClick={() => handleDelete(exp)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--bg, #f8fafc)", borderTop: "2px solid var(--border, #e5e7eb)" }}>
                <td colSpan={5} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                  {filtered.filter((e) => e.status !== "CANCELLED").length} active expense{filtered.filter((e) => e.status !== "CANCELLED").length !== 1 ? "s" : ""}
                </td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>
                  {money(filtered.filter((e) => e.status !== "CANCELLED").reduce((s, e) => s + Number(e.amount), 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {cancelTarget && (
        <CancelExpenseModal
          expense={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={(updated) => {
            setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setCancelTarget(null);
          }}
        />
      )}

      {attachmentTarget && (
        <AttachmentsModal
          entityType="expense"
          entityId={attachmentTarget.id}
          title={attachmentTarget.voucherNo ?? attachmentTarget.category}
          onClose={() => setAttachmentTarget(null)}
        />
      )}
    </div>
  );
}

// ── Cancel modal ────────────────────────────────────────────────────────────

function CancelExpenseModal({
  expense, onClose, onCancelled,
}: { expense: Expense; onClose: () => void; onCancelled: (e: Expense) => void }) {
  const companyApi = useCompanyApi();
  const [reason, setReason] = useState("");
  const [error,  setError]  = useState<string | null>(null);
  const [busy,   setBusy]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const updated = await companyApi.post<Expense>(`/expenses/${expense.id}/cancel`, { reason: reason || undefined });
      onCancelled(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Cancel Expense" onClose={onClose}>
      <div style={{ background: "var(--bg)", borderRadius: 8, padding: "12px 16px", marginBottom: 14, fontSize: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{expense.voucherNo ?? expense.id.slice(0, 8)} — {expense.category}</div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>{money(expense.amount)} · {dateOnly(expense.date)}</div>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)" }}>
        A reversal journal entry will be posted. The voucher will remain visible as <strong>VOID</strong>.
      </p>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered in error, duplicate…" />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Keep</button>
          <button type="submit" className="btn btn-danger" disabled={busy} style={{ background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}>
            {busy ? "Cancelling…" : "Confirm Cancel"}
          </button>
        </div>
      </form>
    </Modal>
  );
}


// ── Full-screen New Expense view ─────────────────────────────────────────────

function NewExpenseView({
  vendors, onBack, onCreated,
}: { vendors: Vendor[]; onBack: () => void; onCreated: (id: string, isRecurring: boolean) => void }) {
  const companyApi = useCompanyApi();
  const [vendorId,    setVendorId]    = useState("");
  const [category,    setCategory]    = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [reference,   setReference]   = useState("");
  const [amount,      setAmount]      = useState("");
  const [date,        setDate]        = useState(() => new Date().toISOString().slice(0, 10));
  const [status,      setStatus]      = useState<"UNPAID" | "PAID">("UNPAID");
  const [isRecurring, setIsRecurring] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  const amountNum = parseFloat(amount) || 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const created = await companyApi.post<{ id: string }>("/expenses", {
        vendorId: vendorId || undefined, category,
        description: description || undefined, reference: reference || undefined,
        amount: amountNum, date, status,
      });
      onCreated(created.id, isRecurring);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create expense");
    } finally { setSubmitting(false); }
  }

  const lbl = {
    fontSize: 10.5, fontWeight: 700, color: "var(--muted)" as const,
    textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 6,
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 0 18px 0", borderBottom: "1.5px solid var(--border)", marginBottom: 24, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button type="button" onClick={onBack} style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            border: "1.5px solid var(--border)", background: "var(--surface)",
            cursor: "pointer", color: "var(--muted)", transition: "background 0.12s, color 0.12s",
          }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--bg)"; el.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--surface)"; el.style.color = "var(--muted)"; }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>
              Expenses / <span style={{ color: "var(--primary)" }}>New</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.4px" }}>New Expense</h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={onBack} style={{ fontSize: 13 }}>Discard</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || amountNum === 0}
            style={{ fontSize: 13, padding: "9px 22px" }}>
            {submitting ? "Creating…" : "Create Expense"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0, alignItems: "flex-start" }}>

        {/* Left: fields */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>

            {/* Card header */}
            <div style={{
              padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: "#eef2ff", color: "#2454ff",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
              }}>💸</div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Expense Details
              </span>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Category + Vendor */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={lbl}>Category</div>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} required style={{ fontSize: 13.5 }}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={lbl}>Vendor <span style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0, fontSize: 10 }}>(optional)</span></div>
                  <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={{ fontSize: 13.5 }}>
                    <option value="">— None —</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Amount + Date */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={lbl}>Amount</div>
                  <input
                    type="number" min="0" step="any"
                    value={amount} onChange={(e) => setAmount(e.target.value)}
                    required placeholder="0.00"
                    style={{ fontSize: 13.5, textAlign: "right", fontWeight: 700 }}
                  />
                </div>
                <div>
                  <div style={lbl}>Date</div>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={{ fontSize: 13.5 }} />
                </div>
              </div>

              {/* Description + Reference */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={lbl}>Description <span style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0, fontSize: 10 }}>(optional)</span></div>
                  <input value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Monthly office supplies…" style={{ fontSize: 13.5 }} />
                </div>
                <div>
                  <div style={lbl}>External Ref <span style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0, fontSize: 10 }}>(optional)</span></div>
                  <input value={reference} onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. RNT-2026-01" style={{ fontSize: 13.5 }} />
                </div>
              </div>

              {/* Recurring toggle */}
              <div
                onClick={() => setIsRecurring((r) => !r)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                  border: `1.5px solid ${isRecurring ? "#bfdbfe" : "var(--border)"}`,
                  background: isRecurring ? "#eff6ff" : "var(--bg)",
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                  background: isRecurring ? "#3b82f6" : "#d1d5db",
                  position: "relative", transition: "background 0.2s",
                }}>
                  <div style={{
                    position: "absolute", top: 3,
                    left: isRecurring ? 21 : 3,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>Recurring expense</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>Show a monthly reminder until paid</div>
                </div>
              </div>

            </div>
          </div>

          {error && <div className="error-text">{error}</div>}
        </div>

        {/* Right: status + summary */}
        <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Payment status card */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Payment Status</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: 9, overflow: "hidden", border: "1.5px solid var(--border)" }}>
                {(["UNPAID", "PAID"] as const).map((s, i) => (
                  <button key={s} type="button" onClick={() => setStatus(s)} style={{
                    border: "none",
                    borderRight: i === 0 ? "1px solid var(--border)" : "none",
                    padding: "10px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    background: status === s
                      ? s === "PAID" ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#d97706,#b45309)"
                      : "var(--surface)",
                    color: status === s ? "#fff" : "var(--muted)",
                    transition: "all 0.15s",
                  }}>
                    {s === "PAID" ? "✓ Paid" : "⏳ Unpaid"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dark summary */}
          <div style={{
            background: "linear-gradient(160deg, #0d1117 0%, #0f1d38 100%)",
            borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5a72", textTransform: "uppercase", letterSpacing: "0.07em" }}>Summary</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                ["Category", category],
                ["Vendor",   selectedVendor ? selectedVendor.name : null],
                ["Date",     date || "—"],
              ].map(([lbl2, val]) => (
                <div key={lbl2 as string} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#4a5a72" }}>{lbl2}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: val ? "#8fa3c0" : "#2e3a52", fontStyle: val ? "normal" : "italic" }}>
                    {val ?? "None"}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Status</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
                  padding: "3px 10px", borderRadius: 99,
                  background: status === "PAID" ? "rgba(22,163,74,0.15)" : "rgba(217,119,6,0.15)",
                  color: status === "PAID" ? "#4ade80" : "#fbbf24",
                }}>{status}</span>
              </div>
              {isRecurring && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#4a5a72" }}>Recurring</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(59,130,246,0.15)", color: "#60a5fa", borderRadius: 99, padding: "3px 9px" }}>↻ YES</span>
                </div>
              )}
              <div style={{ height: 1, background: "#1e2d45" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: "#8fa3c0", fontWeight: 600 }}>Amount</span>
                <span style={{
                  fontSize: 28, fontWeight: 900, letterSpacing: "-0.8px",
                  color: amountNum > 0 ? "#fff" : "#2e3a52", transition: "color 0.2s",
                }}>{money(amountNum)}</span>
              </div>
            </div>

            <button type="submit" disabled={submitting || amountNum === 0} style={{
              width: "100%", padding: "12px",
              background: amountNum > 0
                ? status === "PAID" ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#2454ff,#173bcc)"
                : "rgba(255,255,255,0.06)",
              border: "none", borderRadius: 10,
              color: amountNum > 0 ? "#fff" : "#2e3a52",
              fontSize: 14, fontWeight: 800,
              cursor: amountNum > 0 ? "pointer" : "not-allowed",
              transition: "all 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: amountNum > 0 ? `0 4px 16px ${status === "PAID" ? "rgba(22,163,74,0.4)" : "rgb(36 84 255 / 0.4)"}` : "none",
            }}>
              {submitting ? "Creating…" : "Create Expense"}
            </button>
          </div>

        </div>
      </div>
    </form>
  );
}
