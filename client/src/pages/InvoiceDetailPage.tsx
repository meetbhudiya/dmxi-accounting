import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import type { Customer, Invoice, InvoiceStatus, CreditNote, Product } from "../api/types";
import { ApiError } from "../api/client";
import { money, dateOnly } from "../lib/format";
import { buildInvoicePdf, downloadInvoicePdf } from "../lib/exportPdf";
import { useAuth } from "../auth/AuthContext";
import Modal from "../components/Modal";
import AttachmentsModal from "../components/AttachmentsModal";

const STATUS_OPTIONS: InvoiceStatus[] = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"];

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  DRAFT:          { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
  SENT:           { bg: "#eff6ff", color: "#2454ff", border: "#bfdbfe" },
  PARTIALLY_PAID: { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
  PAID:           { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  OVERDUE:        { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
  VOID:           { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" },
};

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "M-Pesa", "Cheque", "Card"];

export default function InvoiceDetailPage() {
  const { invoiceId }       = useParams<{ invoiceId: string }>();
  const companyApi          = useCompanyApi();
  const { currentCompany }  = useAuth();
  const navigate            = useNavigate();
  const location            = useLocation();
  const navState            = (location.state ?? {}) as { ids?: string[]; currentIdx?: number };
  const isAdmin = currentCompany?.role === "OWNER" || currentCompany?.role === "ADMIN";
  const [invoice,           setInvoice]           = useState<Invoice | null>(null);
  const [error,             setError]             = useState<string | null>(null);
  const [paymentAmount,     setPaymentAmount]     = useState("");
  const [paymentDate,       setPaymentDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod,     setPaymentMethod]     = useState("");
  const [paymentError,      setPaymentError]      = useState<string | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [emailTo,           setEmailTo]           = useState("");
  const [emailStatus,       setEmailStatus]       = useState<{ type: "ok" | "err"; msg: string; preview?: string } | null>(null);
  const [sendingEmail,      setSendingEmail]      = useState(false);
  const [cnAmount,          setCnAmount]          = useState("");
  const [cnDate,            setCnDate]            = useState(() => new Date().toISOString().slice(0, 10));
  const [cnReason,          setCnReason]          = useState("");
  const [cnError,           setCnError]           = useState<string | null>(null);
  const [submittingCn,      setSubmittingCn]      = useState(false);
  const [showEdit,          setShowEdit]          = useState(false);
  const [showAttachments,   setShowAttachments]   = useState(false);
  const [shareUrl,          setShareUrl]          = useState<string | null>(null);
  const [sharing,           setSharing]           = useState(false);
  const [shareCopied,       setShareCopied]       = useState(false);

  function load() {
    if (!invoiceId) return;
    companyApi.get<Invoice>(`/invoices/${invoiceId}`).then(setInvoice).catch((e) => setError(e.message));
  }
  useEffect(load, [companyApi, invoiceId]);

  // Arrow Down/Up navigates to next/previous invoice in the list order
  useEffect(() => {
    const { ids, currentIdx } = navState;
    if (!ids || currentIdx === undefined) return;

    function onKey(e: globalThis.KeyboardEvent) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (e.key === "ArrowDown" && currentIdx! < ids!.length - 1) {
        e.preventDefault();
        navigate(`/invoices/${ids![currentIdx! + 1]}`, { state: { ids, currentIdx: currentIdx! + 1 } });
      } else if (e.key === "ArrowUp" && currentIdx! > 0) {
        e.preventDefault();
        navigate(`/invoices/${ids![currentIdx! - 1]}`, { state: { ids, currentIdx: currentIdx! - 1 } });
      } else if (e.key === "Escape") {
        navigate("/invoices");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState.ids, navState.currentIdx, navigate]);

  async function handleShare() {
    if (!invoice) return;
    setSharing(true);
    try {
      const data = await companyApi.post<{ shareUrl: string }>(`/invoices/${invoice.id}/share`, {});
      setShareUrl(data.shareUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to generate share link");
    } finally {
      setSharing(false);
    }
  }

  async function handleStatusChange(status: InvoiceStatus) {
    if (!invoice) return;
    try {
      setInvoice(await companyApi.patch<Invoice>(`/invoices/${invoice.id}/status`, { status }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update status");
    }
  }

  async function handleSendEmail(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const pdfBuffer = buildInvoicePdf(invoice, currentCompany?.name ?? "DMXI");
      const uint8 = new Uint8Array(pdfBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i += 8192) {
        binary += String.fromCharCode(...uint8.subarray(i, i + 8192));
      }
      const result = await companyApi.post<{ message: string; previewUrl?: string }>(
        `/invoices/${invoice.id}/email`,
        { recipientEmail: emailTo || undefined, pdfBase64: btoa(binary), companyName: currentCompany?.name ?? "DMXI" }
      );
      setEmailStatus({ type: "ok", msg: result.message, preview: result.previewUrl });
      setEmailTo("");
    } catch (e) {
      setEmailStatus({ type: "err", msg: e instanceof ApiError ? e.message : "Failed to send email" });
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleIssueCreditNote(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setCnError(null);
    setSubmittingCn(true);
    try {
      setInvoice(await companyApi.post<Invoice>(`/invoices/${invoice.id}/credit-note`, {
        amount: Number(cnAmount), date: cnDate, reason: cnReason || undefined,
      }));
      setCnAmount(""); setCnReason("");
    } catch (e) {
      setCnError(e instanceof ApiError ? e.message : "Failed to issue credit note");
    } finally {
      setSubmittingCn(false);
    }
  }

  async function handleVoidInvoice() {
    if (!invoice) return;
    if (!window.confirm(`Void invoice ${invoice.number}? A reversal entry will be posted. The invoice will remain as VOID.`)) return;
    try {
      setInvoice(await companyApi.post<Invoice>(`/invoices/${invoice.id}/void`, {}));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to void invoice");
    }
  }

  async function handleDeleteInvoice() {
    if (!invoice) return;
    if (!window.confirm(`Permanently delete invoice ${invoice.number}? This cannot be undone.`)) return;
    try {
      await companyApi.del(`/invoices/${invoice.id}`);
      navigate("/invoices");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete invoice");
    }
  }

  async function handleVoidPayment(paymentId: string) {
    if (!invoice) return;
    if (!window.confirm("Void this payment? A reversal entry will be posted.")) return;
    try {
      setInvoice(await companyApi.post<Invoice>(`/invoices/${invoice.id}/payments/${paymentId}/void`, {}));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to void payment");
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!invoice) return;
    if (!window.confirm("Permanently delete this payment record? This cannot be undone.")) return;
    try {
      setInvoice(await companyApi.del<Invoice>(`/invoices/${invoice.id}/payments/${paymentId}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete payment");
    }
  }

  async function handleAddPayment(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setPaymentError(null);
    setSubmittingPayment(true);
    try {
      setInvoice(await companyApi.post<Invoice>(`/invoices/${invoice.id}/payments`, {
        amount: Number(paymentAmount), date: paymentDate, method: paymentMethod || undefined,
      }));
      setPaymentAmount("");
      setPaymentMethod("");
    } catch (e) {
      setPaymentError(e instanceof ApiError ? e.message : "Failed to record payment");
    } finally {
      setSubmittingPayment(false);
    }
  }

  if (error)    return <div className="error-text" style={{ padding: 32 }}>{error}</div>;
  if (!invoice) return <div className="muted" style={{ padding: 32 }}>Loading…</div>;

  const ss      = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.DRAFT;
  const compNm  = currentCompany?.name ?? "DMXI";
  const balDue  = Number(invoice.balanceDue);
  const grandTt = Number(invoice.grandTotal);

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link to="/invoices" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            ← Back to Invoices
          </Link>
          {navState.ids && navState.currentIdx !== undefined && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                className="btn"
                title="Previous invoice (↑)"
                disabled={navState.currentIdx <= 0}
                onClick={() => navigate(`/invoices/${navState.ids![navState.currentIdx! - 1]}`, { state: { ids: navState.ids, currentIdx: navState.currentIdx! - 1 } })}
                style={{ padding: "3px 8px", fontSize: 12 }}
              >↑</button>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{navState.currentIdx + 1} / {navState.ids.length}</span>
              <button
                className="btn"
                title="Next invoice (↓)"
                disabled={navState.currentIdx >= navState.ids.length - 1}
                onClick={() => navigate(`/invoices/${navState.ids![navState.currentIdx! + 1]}`, { state: { ids: navState.ids, currentIdx: navState.currentIdx! + 1 } })}
                style={{ padding: "3px 8px", fontSize: 12 }}
              >↓</button>
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => downloadInvoicePdf(invoice, compNm)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            ↓ Download PDF
          </button>
          <button className="btn" onClick={() => setShowAttachments(true)} style={{ display: "flex", alignItems: "center", gap: 6 }} title="Reference images & attachments">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
            Attachments
          </button>
          <button className="btn" onClick={handleShare} disabled={sharing} style={{ display: "flex", alignItems: "center", gap: 6 }} title="Share invoice link with client">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            {sharing ? "Generating…" : "Share Link"}
          </button>
          {isAdmin && invoice.status !== "VOID" && (
            <button className="btn" onClick={() => setShowEdit(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#eff6ff", borderColor: "#bfdbfe", color: "#2454ff", fontWeight: 600 }}>
              ✎ Edit Invoice
            </button>
          )}
          <label style={{ margin: 0, display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--muted)" }}>
            Change Status
            <select
              value={invoice.status}
              onChange={(e) => handleStatusChange(e.target.value as InvoiceStatus)}
              style={{ fontSize: 13, padding: "6px 10px" }}
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          {invoice.status !== "VOID" && (
            <button className="btn" onClick={handleVoidInvoice}
              style={{ borderColor: "#fecaca", color: "#dc2626", background: "#fef2f2", fontSize: 13 }}>
              Void Invoice
            </button>
          )}
          {isAdmin && (
            <button className="btn" onClick={handleDeleteInvoice}
              style={{ borderColor: "#dc2626", color: "#dc2626", fontSize: 13 }}>
              Delete Invoice
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

        {/* ── Invoice document ─────────────────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>

          {/* Header band */}
          <div style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>{compNm}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tax Invoice</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>{invoice.number}</div>
              <span style={{
                display: "inline-block", marginTop: 8,
                padding: "4px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.05em",
                background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
              }}>
                {invoice.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Bill To + Invoice Details row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: "1px solid var(--border, #e5e7eb)" }}>
            <div style={{ padding: "20px 32px", borderRight: "1px solid var(--border, #e5e7eb)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Bill To</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{invoice.customer.name}</div>
              {invoice.customer.email   && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 2 }}>{invoice.customer.email}</div>}
              {invoice.customer.phone   && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 2 }}>{invoice.customer.phone}</div>}
              {invoice.customer.address && <div style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "pre-line" }}>{invoice.customer.address}</div>}
            </div>
            <div style={{ padding: "20px 32px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Invoice Details</div>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {[
                    ["Issue Date",  dateOnly(invoice.issueDate)],
                    ["Due Date",    dateOnly(invoice.dueDate)],
                    ...(invoice.reference ? [["Reference", invoice.reference]] : []),
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ fontSize: 12, color: "var(--muted)", padding: "3px 0", paddingRight: 16, whiteSpace: "nowrap" }}>{label}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, padding: "3px 0" }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Line items */}
          <div style={{ padding: "0 0 0 0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid var(--border, #e5e7eb)" }}>
                  <th style={{ padding: "10px 32px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>#</th>
                  <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</th>
                  <th style={{ padding: "10px 8px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Qty</th>
                  <th style={{ padding: "10px 8px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Unit Price</th>
                  <th style={{ padding: "10px 32px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, idx) => (
                  <tr key={item.id ?? idx} style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                    <td style={{ padding: "12px 32px", fontSize: 13, color: "var(--muted)", fontFamily: "monospace" }}>{idx + 1}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.product && item.product !== item.description && (
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{item.product}</div>
                      )}
                      <div style={{ fontSize: 13, color: item.product && item.product !== item.description ? "var(--muted)" : undefined, fontWeight: item.product && item.product !== item.description ? 400 : 500 }}>
                        {item.description}
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 13 }}>{item.quantity}</td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{money(item.unitPrice)}</td>
                    <td style={{ padding: "12px 32px", textAlign: "right", fontSize: 14, fontWeight: 600 }}>
                      {money(Number(item.quantity) * Number(item.unitPrice))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals block */}
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "20px 32px 0" }}>
            <div style={{ minWidth: 260 }}>
              {[
                { label: "Subtotal", value: money(invoice.subtotal) },
                ...(Number(invoice.discountAmount) > 0
                  ? [{ label: `Discount (${invoice.discountPercent}%)`, value: `- ${money(invoice.discountAmount)}` }]
                  : []),
                ...(Number(invoice.vatAmount) > 0
                  ? [{ label: `VAT (${invoice.vatPercent}%)`, value: money(invoice.vatAmount) }]
                  : []),
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 48, padding: "5px 0", fontSize: 13, color: "var(--muted)" }}>
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </div>
              ))}
              <div style={{ borderTop: "2px solid var(--border, #e5e7eb)", marginTop: 8, paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 48 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Grand Total</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#2454ff" }}>{money(grandTt)}</span>
                </div>
              </div>
              {(Number(invoice.amountPaid) > 0 || Number(invoice.creditNoteTotal ?? 0) > 0) && (
                <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  {Number(invoice.amountPaid) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#16a34a" }}>
                      <span>Amount Paid</span><span style={{ fontWeight: 600 }}>{money(invoice.amountPaid)}</span>
                    </div>
                  )}
                  {Number(invoice.creditNoteTotal ?? 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 13, color: "#dc2626" }}>
                      <span>Credit Notes</span><span style={{ fontWeight: 600 }}>- {money(invoice.creditNoteTotal!)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 14, fontWeight: 700, color: balDue > 0 ? "#dc2626" : "#16a34a", borderTop: "1px solid #bbf7d0", paddingTop: 6 }}>
                    <span>Balance Due</span><span>{money(balDue)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div style={{ margin: "20px 32px", padding: "12px 16px", background: "#f8fafc", borderRadius: 8, borderLeft: "3px solid #2454ff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{invoice.notes}</div>
            </div>
          )}

          {/* Credit notes (inline) */}
          {(invoice.creditNotes ?? []).length > 0 && (
            <div style={{ margin: "0 32px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Credit Notes</div>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: "#fef2f2" }}>
                    {["CN Number", "Date", "Reason", "Amount"].map((h) => (
                      <th key={h} style={{ padding: "6px 10px", fontSize: 11, textAlign: h === "Amount" ? "right" : "left", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(invoice.creditNotes as CreditNote[]).map((cn) => (
                    <tr key={cn.id} style={{ borderTop: "1px solid #fecaca" }}>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#dc2626" }}>{cn.number}</td>
                      <td style={{ padding: "7px 10px", fontSize: 13 }}>{dateOnly(cn.date)}</td>
                      <td style={{ padding: "7px 10px", fontSize: 13, color: "var(--muted)" }}>{cn.reason ?? "—"}</td>
                      <td style={{ padding: "7px 10px", fontSize: 13, fontWeight: 600, textAlign: "right", color: "#dc2626" }}>- {money(cn.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Payments history (inline) */}
          {invoice.payments.length > 0 && (
            <div style={{ margin: "0 32px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Payments Received</div>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Date", "Method", "Amount", ""].map((h, i) => (
                      <th key={i} style={{ padding: "6px 10px", fontSize: 11, textAlign: h === "Amount" ? "right" : "left", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((p) => {
                    const voided = p.isVoided;
                    return (
                      <tr key={p.id} style={{ borderTop: "1px solid var(--border, #e5e7eb)", opacity: voided ? 0.5 : 1, background: voided ? "#f8fafc" : undefined }}>
                        <td style={{ padding: "7px 10px", fontSize: 13 }}>{dateOnly(p.date)}</td>
                        <td style={{ padding: "7px 10px", fontSize: 13, color: "var(--muted)" }}>
                          {p.method ?? "—"}
                          {voided && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#94a3b8", background: "#e2e8f0", borderRadius: 10, padding: "1px 6px" }}>VOID</span>}
                        </td>
                        <td style={{ padding: "7px 10px", fontSize: 13, fontWeight: 600, textAlign: "right", color: voided ? "var(--muted)" : "#16a34a", textDecoration: voided ? "line-through" : undefined }}>
                          {money(p.amount)}
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            {!voided && (
                              <button className="btn" onClick={() => handleVoidPayment(p.id)}
                                style={{ fontSize: 10, padding: "2px 6px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}>
                                Void
                              </button>
                            )}
                            {isAdmin && (
                              <button className="btn" onClick={() => handleDeletePayment(p.id)}
                                style={{ fontSize: 10, padding: "2px 6px", color: "#dc2626", borderColor: "#dc2626" }}>
                                Del
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div style={{ background: "#f8fafc", borderTop: "1px solid var(--border, #e5e7eb)", padding: "12px 32px", textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
            {compNm} &nbsp;·&nbsp; Thank you for your business
          </div>
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Balance summary */}
          <div className="card" style={{ padding: "18px 20px", background: balDue > 0 ? "#fef2f2" : "#f0fdf4", border: `1px solid ${balDue > 0 ? "#fecaca" : "#bbf7d0"}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              {balDue > 0 ? "Balance Due" : "Fully Paid"}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: balDue > 0 ? "#dc2626" : "#16a34a" }}>{money(balDue)}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              of {money(grandTt)} total
            </div>
          </div>

          {/* Record payment */}
          {balDue > 0 && invoice.status !== "VOID" && (
            <div className="card">
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Record Payment</h3>
              <form className="form-grid" onSubmit={handleAddPayment}>
                <label style={{ fontSize: 12 }}>
                  Amount
                  <input type="number" min="0" step="any" value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={String(balDue.toFixed(2))} required />
                </label>
                <label style={{ fontSize: 12 }}>
                  Date
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
                </label>
                <label style={{ fontSize: 12 }}>
                  Method
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="">— select method —</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                {paymentError && <div className="error-text">{paymentError}</div>}
                <button className="btn btn-primary" type="submit" disabled={submittingPayment} style={{ width: "100%", marginTop: 4 }}>
                  {submittingPayment ? "Recording…" : "Record Payment"}
                </button>
              </form>
            </div>
          )}

          {/* Issue credit note */}
          {balDue > 0 && invoice.status !== "VOID" && (
            <div className="card" style={{ border: "1px solid #fecaca" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#dc2626" }}>Issue Credit Note</h3>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
                Reduce the balance due without recording a cash payment.
              </p>
              <form className="form-grid" onSubmit={handleIssueCreditNote}>
                <label style={{ fontSize: 12 }}>
                  Amount
                  <input type="number" min="0.01" step="any" value={cnAmount}
                    onChange={(e) => setCnAmount(e.target.value)}
                    placeholder={String(balDue.toFixed(2))} required />
                </label>
                <label style={{ fontSize: 12 }}>
                  Date
                  <input type="date" value={cnDate} onChange={(e) => setCnDate(e.target.value)} required />
                </label>
                <label style={{ fontSize: 12 }}>
                  Reason (optional)
                  <input value={cnReason} onChange={(e) => setCnReason(e.target.value)} placeholder="e.g. Returned goods, discount" />
                </label>
                {cnError && <div className="error-text">{cnError}</div>}
                <button className="btn" type="submit" disabled={submittingCn}
                  style={{ width: "100%", marginTop: 4, borderColor: "#fecaca", color: "#dc2626", background: "#fef2f2" }}>
                  {submittingCn ? "Issuing…" : "Issue Credit Note"}
                </button>
              </form>
            </div>
          )}

          {/* Email invoice */}
          <div className="card">
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Email to Customer</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
              {invoice.customer.email ? `Default: ${invoice.customer.email}` : "No email on file — enter below."}
            </p>
            <form className="form-grid" onSubmit={handleSendEmail}>
              <label style={{ fontSize: 12 }}>
                Recipient
                <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={invoice.customer.email ?? "customer@example.com"} />
              </label>
              {emailStatus && (
                <div style={{
                  padding: "10px 12px", borderRadius: 6, fontSize: 12,
                  background: emailStatus.type === "ok" ? "#f0fdf4" : "#fef2f2",
                  color:      emailStatus.type === "ok" ? "#16a34a"  : "#dc2626",
                  border:    `1px solid ${emailStatus.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
                }}>
                  {emailStatus.msg}
                  {emailStatus.preview && (
                    <> · <a href={emailStatus.preview} target="_blank" rel="noreferrer" style={{ color: "#2454ff" }}>Preview ↗</a></>
                  )}
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={sendingEmail} style={{ width: "100%" }}>
                {sendingEmail ? "Sending…" : "Send PDF by Email"}
              </button>
            </form>
          </div>

        </div>
      </div>

    {showEdit && (
      <EditInvoiceModal
        invoice={invoice}
        onClose={() => setShowEdit(false)}
        onSaved={(updated) => { setInvoice(updated); setShowEdit(false); }}
      />
    )}

    {showAttachments && (
      <AttachmentsModal
        entityType="invoice"
        entityId={invoice.id}
        title={invoice.number}
        onClose={() => setShowAttachments(false)}
      />
    )}

    {shareUrl && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
           onClick={() => setShareUrl(null)}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "28px 28px 24px", maxWidth: 480, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}
             onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Share Invoice</div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
            Anyone with this link can view invoice {invoice.number} without logging in.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input readOnly value={shareUrl}
              style={{ flex: 1, fontSize: 12, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", fontFamily: "monospace" }} />
            <button className="btn" style={{ flexShrink: 0, background: shareCopied ? "#16a34a" : undefined, color: shareCopied ? "#fff" : undefined }}
              onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}>
              {shareCopied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <button onClick={() => setShareUrl(null)} style={{ marginTop: 16, fontSize: 12, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0 }}>Close</button>
        </div>
      </div>
    )}
  </>
  );
}

// ─── Edit Invoice Modal ───────────────────────────────────────────────────────

interface LineItem { description: string; qty: string; rate: string; product?: string; }
function emptyLine(): LineItem { return { description: "", qty: "1", rate: "", product: "" }; }
function calcTotals(items: LineItem[], discPct: number, vatPct: number) {
  const sub  = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0), 0);
  const disc = (sub * discPct) / 100;
  const after = sub - disc;
  const vat  = (after * vatPct) / 100;
  return { subtotal: sub, discountAmt: disc, vatAmt: vat, grandTotal: after + vat };
}
function fmt(n: number) { return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function EditInvoiceModal({
  invoice, onClose, onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (updated: Invoice) => void;
}) {
  const companyApi = useCompanyApi();

  // Pre-fill from existing invoice
  const [customerId,   setCustomerId]   = useState(invoice.customer.id ?? "");
  const [custSearch,   setCustSearch]   = useState(invoice.customer.name);
  const [custOpen,     setCustOpen]     = useState(false);
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [products,     setProducts]     = useState<Product[]>([]);
  const [issueDate,    setIssueDate]    = useState(invoice.issueDate.slice(0, 10));
  const [dueDate,      setDueDate]      = useState(invoice.dueDate.slice(0, 10));
  const [reference,    setReference]    = useState(invoice.reference ?? "");
  const [notes,        setNotes]        = useState(invoice.notes ?? "");
  const [discountPct,  setDiscountPct]  = useState(Number(invoice.discountPercent ?? 0));
  const [vatPct,       setVatPct]       = useState(Number(invoice.vatPercent ?? 0));
  const [items,        setItems]        = useState<LineItem[]>(
    invoice.items.length
      ? invoice.items.map((it) => ({ description: it.description, qty: String(it.quantity), rate: String(it.unitPrice), product: it.product ?? "" }))
      : [emptyLine()]
  );
  const [error,        setError]        = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const custRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    companyApi.get<Customer[]>("/customers").then(setCustomers).catch(() => {});
    companyApi.get<Product[]>("/products").then(setProducts).catch(() => {});
  }, [companyApi]);

  // Close customer dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(custSearch.toLowerCase())
  );

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function handleItemKey(e: KeyboardEvent<HTMLInputElement>, i: number, field: keyof LineItem) {
    if (e.key === "Enter" && field === "rate" && i === items.length - 1) {
      setItems((prev) => [...prev, emptyLine()]);
    }
  }

  const { subtotal, discountAmt, vatAmt, grandTotal } = calcTotals(items, discountPct, vatPct);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId) { setError("Select a customer"); return; }
    const cleanItems = items
      .filter((it) => it.description.trim() || it.product?.trim())
      .map((it) => ({
        product: it.product || undefined,
        description: it.description || it.product || "—",
        quantity: parseFloat(it.qty) || 1,
        unitPrice: parseFloat(it.rate) || 0,
      }));
    if (cleanItems.length === 0) { setError("Add at least one line item"); return; }
    setSaving(true);
    try {
      const updated = await companyApi.patch<Invoice>(`/invoices/${invoice.id}`, {
        customerId,
        issueDate,
        dueDate,
        reference: reference || null,
        notes:     notes || null,
        discountPercent: discountPct,
        vatPercent:      vatPct,
        items: cleanItems,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save invoice");
    } finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" };

  return (
    <Modal title={`Edit Invoice — ${invoice.number}`} onClose={onClose} maxWidth={860}>
      <form onSubmit={handleSubmit}>

        {/* Customer + Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          {/* Customer picker */}
          <div style={{ position: "relative" }} ref={custRef}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer</div>
            <input
              style={inputStyle}
              value={custSearch}
              onChange={(e) => { setCustSearch(e.target.value); setCustOpen(true); setCustomerId(""); }}
              onFocus={() => setCustOpen(true)}
              placeholder="Search customer…"
              required
            />
            {custOpen && filteredCustomers.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.12)", maxHeight: 180, overflowY: "auto" }}>
                {filteredCustomers.map((c) => (
                  <div key={c.id} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
                    onMouseDown={() => { setCustomerId(c.id); setCustSearch(c.name); setCustOpen(false); }}>
                    {c.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Issue Date</div>
            <input type="date" style={inputStyle} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Due Date</div>
            <input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reference</div>
            <input style={inputStyle} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. LPO-001" />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Narration / Notes</div>
            <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>

        {/* Line items */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
          <table style={{ margin: 0, width: "100%" }}>
            <thead>
              <tr style={{ background: "#0f1829" }}>
                <th style={{ color: "#8fa3c0", fontSize: 11, padding: "8px 10px", textAlign: "left", fontWeight: 700, textTransform: "uppercase" }}>Description</th>
                <th style={{ color: "#8fa3c0", fontSize: 11, padding: "8px 10px", textAlign: "right", fontWeight: 700, width: 70 }}>Qty</th>
                <th style={{ color: "#8fa3c0", fontSize: 11, padding: "8px 10px", textAlign: "right", fontWeight: 700, width: 120 }}>Unit Price</th>
                <th style={{ color: "#8fa3c0", fontSize: 11, padding: "8px 10px", textAlign: "right", fontWeight: 700, width: 120 }}>Amount</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const amount = (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0);
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <input
                        style={{ ...inputStyle, marginBottom: 3 }}
                        value={it.description}
                        onChange={(e) => updateItem(i, { description: e.target.value })}
                        placeholder="Description"
                      />
                      <input
                        style={{ ...inputStyle, fontSize: 11, color: "var(--muted)" }}
                        value={it.product ?? ""}
                        onChange={(e) => {
                          updateItem(i, { product: e.target.value });
                          const match = products.find((p) => p.name.toLowerCase() === e.target.value.toLowerCase());
                          if (match) updateItem(i, { product: match.name, description: it.description || match.name, rate: String(match.unitPrice) });
                        }}
                        placeholder="Product (optional)"
                        list={`prod-list-${i}`}
                      />
                      <datalist id={`prod-list-${i}`}>
                        {products.map((p) => <option key={p.id} value={p.name} />)}
                      </datalist>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="number" min="0.01" step="any" style={{ ...inputStyle, textAlign: "right" }}
                        value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="number" min="0" step="any" style={{ ...inputStyle, textAlign: "right" }}
                        value={it.rate} onChange={(e) => updateItem(i, { rate: e.target.value })}
                        onKeyDown={(e) => handleItemKey(e, i, "rate")} />
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, fontSize: 13 }}>
                      {fmt(amount)}
                    </td>
                    <td style={{ padding: "6px 4px" }}>
                      <button type="button" onClick={() => setItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)}
                        style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn" style={{ fontSize: 12 }}
              onClick={() => setItems((prev) => [...prev, emptyLine()])}>
              + Add Line
            </button>
          </div>
        </div>

        {/* Totals + Discount/VAT */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Discount %</div>
              <input type="number" min="0" max="100" step="0.01" style={{ ...inputStyle, width: 100 }}
                value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} />
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>VAT %</div>
              <input type="number" min="0" max="100" step="0.01" style={{ ...inputStyle, width: 100 }}
                value={vatPct} onChange={(e) => setVatPct(Number(e.target.value))} />
            </label>
          </div>
          <div style={{ minWidth: 220, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "var(--muted)" }}>
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "var(--muted)" }}>
                <span>Discount</span><span>- {fmt(discountAmt)}</span>
              </div>
            )}
            {vatAmt > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "var(--muted)" }}>
                <span>VAT ({vatPct}%)</span><span>{fmt(vatAmt)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", fontWeight: 800, fontSize: 16, borderTop: "2px solid var(--border)", marginTop: 4 }}>
              <span>Grand Total</span>
              <span style={{ color: "#2454ff" }}>{fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
