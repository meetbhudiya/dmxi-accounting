import { useEffect, useState, type FormEvent } from "react";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { Invoice, Expense, Purchase, PaymentListItem } from "../api/types";
import { ApiError } from "../api/client";
import { money, dateOnly } from "../lib/format";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import { ColToggle, useColVis, type ColDef } from "../components/ColToggle";

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "M-Pesa", "Cheque", "Card"];

const PAYMENT_COLS: ColDef[] = [
  { key: "date",         label: "Date",          locked: true,  defaultVis: true  },
  { key: "invoiceNum",   label: "Invoice #",      locked: false, defaultVis: true  },
  { key: "customer",     label: "Customer",       locked: false, defaultVis: true  },
  { key: "reference",    label: "Reference No",   locked: false, defaultVis: false },
  { key: "amount",       label: "Amount",         locked: true,  defaultVis: true  },
  { key: "method",       label: "Method",         locked: false, defaultVis: true  },
  { key: "notes",        label: "Notes",          locked: false, defaultVis: true  },
  { key: "invoiceTotal", label: "Invoice Total",  locked: false, defaultVis: false },
  { key: "status",       label: "Status",         locked: false, defaultVis: true  },
];

type Tab = "receive" | "pay";

// ── Small SVG icons ───────────────────────────────────────────────────────────

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  list:  "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h6",
  edit:  "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  void:  "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
};

export default function PaymentsPage() {
  const [tab,         setTab]         = useState<Tab>("receive");
  const [showList,    setShowList]    = useState(false);

  return (
    <div>
      <div className="page-header">
        <h1>Payments</h1>
        <button
          className="btn"
          onClick={() => setShowList(true)}
          style={{ display: "flex", alignItems: "center", gap: 7 }}
        >
          <Icon d={ICONS.list} size={14} />
          Payment List
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        <button className={`btn${tab === "receive" ? " btn-primary" : ""}`} onClick={() => setTab("receive")} style={{ minWidth: 160 }}>
          Receive Payments
        </button>
        <button className={`btn${tab === "pay" ? " btn-primary" : ""}`} onClick={() => setTab("pay")} style={{ minWidth: 160 }}>
          Pay Bills
        </button>
      </div>

      {tab === "receive" ? <ReceivePayments /> : <PayBills />}

      <PaymentListDrawer open={showList} onClose={() => setShowList(false)} />
    </div>
  );
}

// ─── Payment List Drawer ──────────────────────────────────────────────────────

function PaymentListDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const canEdit = currentCompany?.role === "OWNER" || currentCompany?.role === "ADMIN";

  const [payments,   setPayments]   = useState<PaymentListItem[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [loadErr,    setLoadErr]    = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [editing,    setEditing]    = useState<PaymentListItem | null>(null);
  const [voiding,    setVoiding]    = useState<PaymentListItem | null>(null);
  const [actionErr,  setActionErr]  = useState<string | null>(null);

  const colKey = `dmxi_cols_payments_${currentCompany?.id ?? ""}`;
  const { vis, toggle, show, visCount } = useColVis(colKey, PAYMENT_COLS);

  function load() {
    setLoading(true);
    setLoadErr(null);
    companyApi.get<PaymentListItem[]>("/payments")
      .then(setPayments)
      .catch((err) => setLoadErr(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (open) load(); }, [open, companyApi]);

  if (!open) return null;

  const visible = showVoided ? payments : payments.filter((p) => !p.isVoided);
  const totalActive = payments.filter((p) => !p.isVoided).reduce((s, p) => s + Number(p.amount), 0);
  const totalCols = visCount + (canEdit ? 1 : 0);

  // Columns that appear before the locked "amount" column
  const preAmountCount = PAYMENT_COLS
    .filter((c) => c.key !== "amount" && (c.locked || vis[c.key]) && ["date","invoiceNum","customer","reference"].includes(c.key))
    .length;
  // Columns after "amount"
  const postAmountCount = PAYMENT_COLS
    .filter((c) => c.key !== "amount" && (c.locked || vis[c.key]) && ["method","notes","invoiceTotal","status"].includes(c.key))
    .length + (canEdit ? 1 : 0);

  async function handleVoid(p: PaymentListItem, note: string) {
    setActionErr(null);
    try {
      await companyApi.post(`/invoices/${p.invoiceId}/payments/${p.id}/void`, { voidNote: note || undefined });
      load();
      setVoiding(null);
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : "Failed to void payment");
    }
  }

  return (
    <>
      {/* Overlay */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex" }}>
        <div style={{ flex: 1, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }} onClick={onClose} />

        {/* Panel */}
        <div style={{ width: 760, background: "var(--bg)", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.18)", overflow: "hidden" }}>

          {/* Panel header */}
          <div style={{ background: "linear-gradient(135deg,#0f1829 0%,#162040 100%)", padding: "20px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ background: "rgba(36,84,255,0.2)", borderRadius: 8, padding: 8, display: "flex" }}>
                <Icon d={ICONS.list} size={16} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Payment List</div>
                <div style={{ fontSize: 11, color: "#4a5a72", marginTop: 1 }}>
                  {payments.filter((p) => !p.isVoided).length} active · {money(totalActive)} total received
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8fa3c0", cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
                Show voided
              </label>
              <ColToggle cols={PAYMENT_COLS} vis={vis} onToggle={toggle} />
              <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", color: "#8fa3c0", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>✕</button>
            </div>
          </div>

          {loadErr && (
            <div style={{ padding: "10px 20px", background: "#fef2f2", color: "#dc2626", fontSize: 13, borderBottom: "1px solid #fecaca" }}>
              Failed to load payments: {loadErr}
            </div>
          )}
          {actionErr && (
            <div style={{ padding: "10px 20px", background: "#fef2f2", color: "#dc2626", fontSize: 13, borderBottom: "1px solid #fecaca" }}>{actionErr}</div>
          )}

          {/* Table */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            <table style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  {show("invoiceNum")   && <th>Invoice #</th>}
                  {show("customer")     && <th>Customer</th>}
                  {show("reference")    && <th>Reference No</th>}
                  <th style={{ textAlign: "right" }}>Amount</th>
                  {show("method")       && <th>Method</th>}
                  {show("notes")        && <th>Notes</th>}
                  {show("invoiceTotal") && <th style={{ textAlign: "right", width: 120 }}>Invoice Total</th>}
                  {show("status")       && <th>Status</th>}
                  {canEdit              && <th></th>}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={totalCols} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading…</td></tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr><td colSpan={totalCols} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No payments found.</td></tr>
                )}
                {visible.map((p) => (
                  <tr key={p.id} style={{ opacity: p.isVoided ? 0.55 : 1, background: p.isVoided ? "var(--bg)" : undefined }}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{dateOnly(p.date)}</td>
                    {show("invoiceNum")   && <td style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#2454ff" }}>{p.invoice.number}</td>}
                    {show("customer")     && <td style={{ fontWeight: 500 }}>{p.invoice.customer.name}</td>}
                    {show("reference")    && <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.invoice.reference ?? "—"}</td>}
                    <td style={{ textAlign: "right", fontWeight: 700, fontSize: 14, textDecoration: p.isVoided ? "line-through" : undefined }}>
                      {money(p.amount)}
                    </td>
                    {show("method")       && <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.method ?? "—"}</td>}
                    {show("notes")        && <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 140 }}>{p.notes ?? "—"}</td>}
                    {show("invoiceTotal") && <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{p.invoice.grandTotal ? money(p.invoice.grandTotal) : "—"}</td>}
                    {show("status")       && (
                      <td>
                        {p.isVoided ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 5, padding: "2px 7px" }}>
                            VOID
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 5, padding: "2px 7px" }}>
                            ● PAID
                          </span>
                        )}
                      </td>
                    )}
                    {canEdit && (
                      <td>
                        {!p.isVoided && (
                          <div style={{ display: "flex", gap: 5 }}>
                            <button
                              className="btn"
                              title="Edit payment"
                              onClick={() => { setActionErr(null); setEditing(p); }}
                              style={{ padding: "4px 7px", display: "flex", alignItems: "center" }}
                            >
                              <Icon d={ICONS.edit} size={13} />
                            </button>
                            <button
                              className="btn"
                              title="Void payment"
                              onClick={() => { setActionErr(null); setVoiding(p); }}
                              style={{ padding: "4px 7px", display: "flex", alignItems: "center", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
                            >
                              <Icon d={ICONS.void} size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {!loading && visible.filter((p) => !p.isVoided).length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                    <td colSpan={preAmountCount} style={{ fontWeight: 700, padding: "10px 16px", fontSize: 13 }}>Total Received</td>
                    <td style={{ textAlign: "right", fontWeight: 800, fontSize: 15, color: "#16a34a", padding: "10px 16px" }}>
                      {money(visible.filter((p) => !p.isVoided).reduce((s, p) => s + Number(p.amount), 0))}
                    </td>
                    {postAmountCount > 0 && <td colSpan={postAmountCount} />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <EditPaymentModal
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {/* Void confirm modal */}
      {voiding && (
        <VoidPaymentModal
          payment={voiding}
          onClose={() => setVoiding(null)}
          onConfirm={(note) => handleVoid(voiding, note)}
        />
      )}
    </>
  );
}

// ─── Edit Payment Modal ───────────────────────────────────────────────────────

function EditPaymentModal({
  payment, onClose, onSaved,
}: {
  payment: PaymentListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const companyApi = useCompanyApi();
  const [amount,  setAmount]  = useState(payment.amount);
  const [date,    setDate]    = useState(payment.date.slice(0, 10));
  const [method,  setMethod]  = useState(payment.method ?? PAYMENT_METHODS[0]);
  const [notes,   setNotes]   = useState(payment.notes ?? "");
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await companyApi.patch(`/invoices/${payment.invoiceId}/payments/${payment.id}`, {
        amount: Number(amount),
        date,
        method: method || undefined,
        notes:  notes || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update payment");
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Edit Payment" onClose={onClose}>
      <div style={{ background: "var(--bg-alt,#f9fafb)", borderRadius: 8, padding: "12px 16px", marginBottom: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{payment.invoice.number} — {payment.invoice.customer.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>Original: {money(payment.amount)} on {dateOnly(payment.date)}</div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Amount
            <input type="number" min="0.01" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label>
            Payment Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>
        <label>
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Transaction ref, cheque no…" />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Void Confirm Modal ───────────────────────────────────────────────────────

function VoidPaymentModal({
  payment, onClose, onConfirm,
}: {
  payment: PaymentListItem;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Modal title="Void Payment" onClose={onClose}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{payment.invoice.number} — {payment.invoice.customer.name}</div>
        <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
          This will reverse <strong>{money(payment.amount)}</strong> received on {dateOnly(payment.date)} and re-open the invoice balance.
        </div>
      </div>
      <label style={{ display: "block", marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Reason (optional)</div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Duplicate entry, bounced cheque…" style={{ width: "100%" }} />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => onConfirm(note)}
          style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626", fontWeight: 700 }}>
          Void Payment
        </button>
      </div>
    </Modal>
  );
}

// ─── Receive Payments ─────────────────────────────────────────────────────────

const RECEIVE_COLS: ColDef[] = [
  { key: "number",     label: "Invoice #",   locked: true,  defaultVis: true  },
  { key: "customer",   label: "Customer",    locked: true,  defaultVis: true  },
  { key: "reference",  label: "Reference No",locked: false, defaultVis: false },
  { key: "issueDate",  label: "Issue Date",  locked: false, defaultVis: true  },
  { key: "dueDate",    label: "Due Date",    locked: false, defaultVis: true  },
  { key: "total",      label: "Total",       locked: false, defaultVis: true  },
  { key: "paid",       label: "Paid",        locked: false, defaultVis: true  },
  { key: "balanceDue", label: "Balance Due", locked: true,  defaultVis: true  },
  { key: "status",     label: "Status",      locked: false, defaultVis: true  },
];

function ReceivePayments() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [paying,   setPaying]   = useState<Invoice | null>(null);

  const colKey = `dmxi_cols_receive_${currentCompany?.id ?? ""}`;
  const { vis, toggle, show, visCount } = useColVis(colKey, RECEIVE_COLS);

  function load() {
    setLoading(true);
    companyApi.get<Invoice[]>("/invoices")
      .then((all) => setInvoices(all.filter((inv) => inv.status !== "PAID" && inv.status !== "VOID" && Number(inv.balanceDue) > 0)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyApi]);

  const totalOutstanding = invoices.reduce((s, inv) => s + Number(inv.balanceDue), 0);
  const overdueCount     = invoices.filter((inv) => inv.status === "OVERDUE").length;
  const totalCols        = visCount + 1; // +1 for the action column

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 22 }}>
        <SummaryCard label="Total Outstanding" value={money(totalOutstanding)} accent />
        <SummaryCard label="Open Invoices"     value={String(invoices.length)} />
        <SummaryCard label="Overdue"           value={String(overdueCount)} warn={overdueCount > 0} />
      </div>

      {error && <div className="error-text">{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ColToggle cols={RECEIVE_COLS} vis={vis} onToggle={toggle} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              {show("reference") && <th>Reference No</th>}
              {show("issueDate") && <th>Issue Date</th>}
              {show("dueDate")   && <th>Due Date</th>}
              {show("total")     && <th style={{ textAlign: "right" }}>Total</th>}
              {show("paid")      && <th style={{ textAlign: "right" }}>Paid</th>}
              <th style={{ textAlign: "right" }}>Balance Due</th>
              {show("status")    && <th>Status</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{inv.number}</td>
                <td style={{ fontWeight: 500 }}>{inv.customer.name}</td>
                {show("reference") && <td style={{ fontSize: 12, color: "var(--muted)" }}>{inv.reference ?? "—"}</td>}
                {show("issueDate") && <td>{dateOnly(inv.issueDate)}</td>}
                {show("dueDate")   && <td style={{ color: inv.status === "OVERDUE" ? "#ef4444" : undefined }}>{dateOnly(inv.dueDate)}</td>}
                {show("total")     && <td style={{ textAlign: "right" }}>{money(inv.grandTotal)}</td>}
                {show("paid")      && <td style={{ textAlign: "right" }}>{money(inv.amountPaid)}</td>}
                <td style={{ textAlign: "right", fontWeight: 700, color: "#ef4444" }}>{money(inv.balanceDue)}</td>
                {show("status")    && <td><StatusBadge status={inv.status} /></td>}
                <td>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setPaying(inv)}>Receive</button>
                </td>
              </tr>
            ))}
            {!loading && invoices.length === 0 && (
              <tr><td colSpan={totalCols} className="muted" style={{ textAlign: "center", padding: 28 }}>No outstanding invoices.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {paying && (
        <ReceivePaymentModal invoice={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />
      )}
    </div>
  );
}

function ReceivePaymentModal({ invoice, onClose, onSaved }: { invoice: Invoice; onClose: () => void; onSaved: () => void }) {
  const companyApi = useCompanyApi();
  const [amount, setAmount]  = useState(invoice.balanceDue);
  const [date,   setDate]    = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod]  = useState(PAYMENT_METHODS[0]);
  const [notes,  setNotes]   = useState("");
  const [error,  setError]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      await companyApi.post(`/invoices/${invoice.id}/payments`, { amount: Number(amount), date, method, notes: notes || undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally { setSubmitting(false); }
  }

  return (
    <Modal title="Record Payment" onClose={onClose}>
      <div style={{ background: "var(--bg-alt,#f9fafb)", borderRadius: 8, padding: "12px 16px", marginBottom: 18, fontSize: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{invoice.number} — {invoice.customer.name}</div>
        <div className="muted">Grand Total: <strong>{money(invoice.grandTotal)}</strong> · Balance Due: <strong style={{ color: "#ef4444" }}>{money(invoice.balanceDue)}</strong></div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Amount Received<input type="number" min="0.01" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label>Payment Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        </div>
        <label>Payment Method<select value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <label>Notes (optional)<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Transaction ref, cheque no…" /></label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Recording…" : "Record Payment"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Pay Bills ────────────────────────────────────────────────────────────────

type Bill = { kind: "expense"; data: Expense } | { kind: "purchase"; data: Purchase };

function billDate(b: Bill)        { return b.data.date; }
function billAmount(b: Bill)      { return b.kind === "expense" ? Number(b.data.amount) : b.data.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0); }
function billVoucher(b: Bill)     { return b.kind === "expense" ? (b.data.voucherNo ?? b.data.reference ?? `EXP-${b.data.id.slice(0,8).toUpperCase()}`) : (b.data.voucherNo ?? b.data.reference ?? `PUR-${b.data.id.slice(0,8).toUpperCase()}`); }
function billDescription(b: Bill) { return b.kind === "expense" ? `${b.data.category}${b.data.description ? ` — ${b.data.description}` : ""}` : (b.data.items[0]?.product?.name ?? b.data.items[0]?.description ?? "Purchase"); }
function billVendor(b: Bill)      { return b.data.vendor?.name ?? "—"; }
function daysOutstanding(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000); }

function PayBills() {
  const companyApi = useCompanyApi();
  const [bills,   setBills]   = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [paying,  setPaying]  = useState<Bill | null>(null);

  function load() {
    setLoading(true);
    Promise.all([companyApi.get<Expense[]>("/expenses"), companyApi.get<Purchase[]>("/purchases")])
      .then(([expenses, purchases]) => {
        const all: Bill[] = [
          ...expenses.filter((e) => e.status === "UNPAID").map((e) => ({ kind: "expense" as const, data: e })),
          ...purchases.filter((p) => p.status === "UNPAID").map((p) => ({ kind: "purchase" as const, data: p })),
        ].sort((a, b) => new Date(billDate(a)).getTime() - new Date(billDate(b)).getTime());
        setBills(all);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyApi]);

  const totalPayable = bills.reduce((s, b) => s + billAmount(b), 0);
  const overdueCount = bills.filter((b) => daysOutstanding(billDate(b)) > 30).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 22 }}>
        <SummaryCard label="Total Payable"  value={money(totalPayable)} accent />
        <SummaryCard label="Pending Bills"  value={String(bills.length)} />
        <SummaryCard label="> 30 days"      value={String(overdueCount)} warn={overdueCount > 0} />
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Voucher #</th><th>Vendor</th><th>Type</th><th>Description</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th style={{ textAlign: "right" }}>Days</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const days = daysOutstanding(billDate(b));
              return (
                <tr key={`${b.kind}-${b.data.id}`}>
                  <td>{dateOnly(billDate(b))}</td>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 13 }}>{billVoucher(b)}</td>
                  <td>{billVendor(b)}</td>
                  <td><span className={`badge ${b.kind === "expense" ? "badge-blue" : "badge-gray"}`} style={{ fontSize: 11 }}>{b.kind === "expense" ? "Expense" : "Purchase"}</span></td>
                  <td className="muted" style={{ maxWidth: 220 }}>{billDescription(b)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{money(billAmount(b))}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: days > 30 ? "#ef4444" : days > 14 ? "#f59e0b" : undefined }}>{days}</td>
                  <td><button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setPaying(b)}>Pay</button></td>
                </tr>
              );
            })}
            {!loading && bills.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 28 }}>No outstanding bills.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {paying && <PayBillModal bill={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
    </div>
  );
}

function PayBillModal({ bill, onClose, onSaved }: { bill: Bill; onClose: () => void; onSaved: () => void }) {
  const companyApi = useCompanyApi();
  const [date,   setDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [error,  setError]  = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const amount = billAmount(bill);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const body = { status: "PAID", paidDate: date, paymentMethod: method };
      if (bill.kind === "expense") await companyApi.patch(`/expenses/${bill.data.id}/status`, body);
      else                         await companyApi.patch(`/purchases/${bill.data.id}/status`, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally { setSubmitting(false); }
  }

  return (
    <Modal title="Pay Bill" onClose={onClose}>
      <div style={{ background: "var(--bg-alt,#f9fafb)", borderRadius: 8, padding: "12px 16px", marginBottom: 18, fontSize: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{billVoucher(bill)} — {billDescription(bill)}</div>
        <div className="muted">Vendor: <strong>{billVendor(bill)}</strong> · Amount: <strong style={{ color: "#ef4444" }}>{money(amount)}</strong></div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Payment Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label>Payment Method<select value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        </div>
        <div style={{ padding: "10px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, fontSize: 14 }}>
          This will debit <strong>Accounts Payable</strong> and credit <strong>Cash</strong> for <strong>{money(amount)}</strong> on {date}.
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Processing…" : `Pay ${money(amount)}`}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="card" style={{ flex: 1, padding: "16px 20px" }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: warn ? "#ef4444" : accent ? "var(--primary,#2454ff)" : undefined }}>{value}</div>
    </div>
  );
}
