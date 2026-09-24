import React, { useState, useMemo, useRef, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { money } from "../lib/format";
import Modal from "../components/Modal";
import { downloadQuotePdf } from "../lib/exportPdf";
import { getCurrencySymbol } from "../lib/currency";
import { useAuth } from "../auth/AuthContext";
import { useCompanyApi } from "../api/useCompanyApi";
import { useRegisterNewShortcut } from "../contexts/ShortcutsContext";

// ── Icons ─────────────────────────────────────────────────────────────────────

const PATHS = {
  back:    "M10 19l-7-7m0 0l7-7m-7 7h18",
  plus:    "M12 5v14M5 12h14",
  check:   "M5 13l4 4L19 7",
  trash:   "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  doc:     "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8",
  cal:     "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  user:    "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  clock:   "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  percent: "M19 5L5 19M9 5a2 2 0 110 4 2 2 0 010-4zm6 10a2 2 0 110 4 2 2 0 010-4z",
  notes:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  convert: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
};

function SvgIcon({ path, size = 18, stroke = "currentColor", strokeWidth = 1.8 }: {
  path: string; size?: number; stroke?: string; strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {path.split("|").map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";

interface QuoteItem {
  description: string;
  qty: number;
  unitPrice: number;
}

interface Quote {
  id: string;
  number: string;
  customer: string;
  issueDate: string;
  validUntil: string;
  status: QuoteStatus;
  items: QuoteItem[];
  notes: string;
  vatPercent: number;
  vatAmount: number;
  subtotal: number;
  total: number;
}

interface LineItem {
  description: string;
  qty: string;
  unitPrice: string;
}

function emptyLine(): LineItem {
  return { description: "", qty: "1", unitPrice: "" };
}

function mapQuote(raw: any): Quote {
  return {
    id:         raw.id,
    number:     raw.number,
    customer:   raw.customer,
    issueDate:  typeof raw.issueDate === "string" ? raw.issueDate.slice(0, 10) : new Date(raw.issueDate).toISOString().slice(0, 10),
    validUntil: typeof raw.validUntil === "string" ? raw.validUntil.slice(0, 10) : new Date(raw.validUntil).toISOString().slice(0, 10),
    status:     raw.status as QuoteStatus,
    notes:      raw.notes ?? "",
    vatPercent: Number(raw.vatPercent ?? 0),
    vatAmount:  Number(raw.vatAmount ?? 0),
    subtotal:   Number(raw.subtotal ?? 0),
    total:      Number(raw.total),
    items:      (raw.items ?? []).map((it: any) => ({
      description: it.description,
      qty:         Number(it.qty),
      unitPrice:   Number(it.unitPrice),
    })),
  };
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<QuoteStatus, { bg: string; color: string; label: string; dot: string; border: string }> = {
  DRAFT:    { bg: "#f1f5f9", color: "#64748b", label: "Draft",    dot: "#94a3b8", border: "#e2e8f0" },
  SENT:     { bg: "#eff6ff", color: "#2454ff", label: "Sent",     dot: "#2454ff", border: "#c7d7ff" },
  ACCEPTED: { bg: "#f0fdf4", color: "#16a34a", label: "Accepted", dot: "#16a34a", border: "#bbf7d0" },
  DECLINED: { bg: "#fef2f2", color: "#dc2626", label: "Declined", dot: "#dc2626", border: "#fecaca" },
  EXPIRED:  { bg: "#fffbeb", color: "#d97706", label: "Expired",  dot: "#d97706", border: "#fde68a" },
};

const NEXT_STATUS: Partial<Record<QuoteStatus, QuoteStatus>> = {
  DRAFT: "SENT",
  SENT:  "ACCEPTED",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function addDays(d: string, n: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10);
}
function fmt(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function avatarColor(name: string) {
  const COLORS = ["#6366f1", "#0ea265", "#f59e0b", "#ef4444", "#8b5cf6", "#0891b2", "#d97706"];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return COLORS[h % COLORS.length];
}
function isExpired(q: Quote) {
  return q.status !== "ACCEPTED" && q.status !== "DECLINED" && q.validUntil < today();
}
function daysUntilExpiry(q: Quote) {
  return Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: QuoteStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: "uppercase",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const bg = avatarColor(name);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 32, height: 32, borderRadius: "50%", background: bg,
      color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0,
    }}>
      {initials(name)}
    </span>
  );
}

// ── Full-screen New Quote View ─────────────────────────────────────────────────

function NewQuoteView({ onBack, onSave, editing }: {
  onBack: () => void;
  onSave: (data: { customer: string; issueDate: string; validUntil: string; notes: string; vatPercent: number; items: QuoteItem[] }) => Promise<void>;
  editing?: Quote;
}) {
  const initValidDays = editing
    ? Math.max(1, Math.round((new Date(editing.validUntil).getTime() - new Date(editing.issueDate).getTime()) / 86400000))
    : 30;

  const [customer,     setCustomer]     = useState(editing?.customer ?? "");
  const [issueDate,    setIssueDate]    = useState(editing?.issueDate ?? today());
  const [validDays,    setValidDays]    = useState(initValidDays);
  const [vatPercent,   setVatPercent]   = useState(editing ? Number((editing as any).vatPercent ?? 16) : 16);
  const [notes,        setNotes]        = useState(editing?.notes ?? "");
  const [lines,        setLines]        = useState<LineItem[]>(
    editing?.items.length
      ? editing.items.map((it) => ({ description: it.description, qty: String(it.qty), unitPrice: String(it.unitPrice) }))
      : [emptyLine()]
  );
  const [error,        setError]        = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [focusNewLine, setFocusNewLine] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef   = useRef<HTMLFormElement>(null);

  // Focus first field of newly-added line
  useEffect(() => {
    if (!focusNewLine || !formRef.current) return;
    setFocusNewLine(false);
    const inputs = Array.from(formRef.current.querySelectorAll<HTMLInputElement>("[data-nav]"));
    const first = inputs[(lines.length - 1) * 3];
    if (first) { first.focus(); first.select(); }
  }, [focusNewLine, lines.length]);

  function handleLineKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    const target = e.target as HTMLInputElement;

    if (e.key === "Escape") {
      e.preventDefault();
      onBack();
      return;
    }

    if (!(target as HTMLElement).dataset.nav) return;
    if (target.tagName === "TEXTAREA") return;

    if (e.key === "Enter") {
      e.preventDefault();
      const all = Array.from(formRef.current!.querySelectorAll<HTMLElement>("[data-nav]"));
      const idx = all.indexOf(target);
      const next = all[idx + 1];
      if (next) {
        next.focus();
        if (next instanceof HTMLInputElement) next.select();
      } else {
        addLine();
        setFocusNewLine(true);
      }
      return;
    }

    if (e.key === "Backspace" && target.value === "") {
      e.preventDefault();
      const all = Array.from(formRef.current!.querySelectorAll<HTMLElement>("[data-nav]"));
      const idx = all.indexOf(target);
      if (idx > 0) {
        const prev = all[idx - 1] as HTMLInputElement;
        prev.focus();
        prev.select?.();
      }
    }
  }

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  const parsedItems: QuoteItem[] = lines.map((l) => ({
    description: l.description,
    qty: parseFloat(l.qty) || 0,
    unitPrice: parseFloat(l.unitPrice) || 0,
  }));
  const subtotal   = parsedItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const vatAmount  = subtotal * (vatPercent / 100);
  const grandTotal = subtotal + vatAmount;
  const lineCount  = lines.length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const validItems = parsedItems.filter((it) => it.description);
    if (!customer.trim()) { setError("Customer name is required."); return; }
    if (validItems.length === 0) { setError("Add at least one line item with a description."); return; }
    if (validItems.some((it) => !it.qty || it.qty <= 0)) { setError("Each item needs a quantity greater than 0."); return; }
    setSaving(true);
    try {
      await onSave({
        customer:   customer.trim(),
        issueDate,
        validUntil: addDays(issueDate, validDays),
        notes,
        vatPercent,
        items: validItems,
      });
      onBack();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save quotation");
    } finally {
      setSaving(false);
    }
  }

  const LABEL: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: "var(--muted)",
    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
    display: "flex", alignItems: "center", gap: 4,
  };
  const INPUT: React.CSSProperties = { fontSize: 13.5 };

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleLineKeyDown} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 0 18px 0",
        borderBottom: "1.5px solid var(--border)",
        marginBottom: 24,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button" onClick={onBack}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 10,
              border: "1.5px solid var(--border)", background: "var(--surface)",
              cursor: "pointer", color: "var(--muted)", transition: "all 0.12s",
            }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--bg)"; el.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--surface)"; el.style.color = "var(--muted)"; }}
          >
            <SvgIcon path={PATHS.back} size={16} strokeWidth={2.2} />
          </button>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>
              Quotations /<span style={{ color: "var(--primary)", marginLeft: 5 }}>{editing ? editing.number : "New"}</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.4px" }}>
              {editing ? "Edit Quotation" : "New Quotation"}
            </h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={onBack} style={{ fontSize: 13 }}>Discard</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={grandTotal === 0 || !customer.trim() || saving}
            style={{ fontSize: 13, padding: "9px 22px", gap: 8 }}
          >
            <SvgIcon path={PATHS.check} size={14} strokeWidth={2.5} />
            {saving ? "Saving…" : editing ? "Save Changes" : "Save Draft"}
          </button>
        </div>
      </div>

      {/* ── Body: two-column ─────────────────────────────────────────────────── */}
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
              type="button" onClick={addLine}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                border: "1.5px dashed #2454ff", background: "transparent",
                color: "#2454ff", borderRadius: 8, padding: "6px 14px",
                fontSize: 12.5, fontWeight: 700, cursor: "pointer", transition: "background 0.12s",
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
              const lineTotal = (parseFloat(line.qty) || 0) * (parseFloat(line.unitPrice) || 0);
              return (
                <div
                  key={i}
                  className="card"
                  style={{
                    padding: 0, overflow: "hidden",
                    border: "1.5px solid var(--border)",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#a5b8ff"; el.style.boxShadow = "0 4px 16px rgba(36,84,255,0.08)"; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.boxShadow = ""; }}
                >
                  {/* Card top bar */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px", background: "var(--bg)", borderBottom: "1px solid var(--border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: 7,
                        background: "linear-gradient(135deg,#2454ff,#173bcc)",
                        color: "#fff", fontSize: 11, fontWeight: 800,
                        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500 }}>
                        {line.description || "New line item"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {lineTotal > 0 && (
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#2454ff", letterSpacing: "-0.2px" }}>
                          {money(lineTotal)}
                        </span>
                      )}
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: 7,
                            border: "1.5px solid var(--border)", background: "var(--surface)",
                            cursor: "pointer", color: "var(--muted)", transition: "all 0.12s",
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 140px", gap: 0 }}>
                    <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
                      <div style={LABEL}>Description</div>
                      <input
                        data-nav={`${i}-desc`}
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                        placeholder="Service or product description…"
                        style={INPUT}
                        required={i === 0}
                      />
                    </div>

                    <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
                      <div style={LABEL}>Qty</div>
                      <input
                        data-nav={`${i}-qty`}
                        type="number" min="0.001" step="any"
                        value={line.qty}
                        onChange={(e) => updateLine(i, { qty: e.target.value })}
                        style={{ ...INPUT, textAlign: "right", fontWeight: 700 }}
                      />
                    </div>

                    <div style={{ padding: "14px 16px" }}>
                      <div style={LABEL}>Unit Price</div>
                      <div style={{ position: "relative" }}>
                        <span style={{
                          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                          fontSize: 13, color: "var(--muted)", fontWeight: 600, pointerEvents: "none",
                        }}>{getCurrencySymbol()}</span>
                        <input
                          data-nav={`${i}-price`}
                          type="number" min="0" step="any"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                          placeholder="0.00"
                          style={{ ...INPUT, textAlign: "right", fontWeight: 700, paddingLeft: 22 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Add line button — bottom */}
          <button
            type="button" onClick={addLine}
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
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Quotation details card */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Quotation Details
              </span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Customer */}
              <div>
                <div style={LABEL}><SvgIcon path={PATHS.user} size={11} strokeWidth={2} /> Customer</div>
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Acme Corp"
                  style={INPUT}
                  required
                />
              </div>

              {/* Issue date */}
              <div>
                <div style={LABEL}><SvgIcon path={PATHS.cal} size={11} strokeWidth={2} /> Issue Date</div>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={INPUT} required />
              </div>

              {/* Valid for */}
              <div>
                <div style={LABEL}><SvgIcon path={PATHS.clock} size={11} strokeWidth={2} /> Valid For (days)</div>
                <input
                  type="number" min={1}
                  value={validDays}
                  onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
                  style={INPUT}
                />
                {issueDate && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
                    Expires: <strong>{fmt(addDays(issueDate, validDays))}</strong>
                  </div>
                )}
              </div>

              {/* VAT */}
              <div>
                <div style={LABEL}><SvgIcon path={PATHS.percent} size={11} strokeWidth={2} /> VAT / Tax %</div>
                <input
                  type="number" min={0} max={100} step="any"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(parseFloat(e.target.value) || 0)}
                  style={INPUT}
                />
              </div>

              {/* Notes */}
              <div>
                <div style={LABEL}><SvgIcon path={PATHS.notes} size={11} strokeWidth={2} /> Notes / Terms</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment terms, delivery notes…"
                  rows={3}
                  style={{ ...INPUT, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            </div>
          </div>

          {/* Summary card */}
          <div style={{
            background: "linear-gradient(160deg, #0d1117 0%, #0f1d38 100%)",
            borderRadius: 14, padding: 20,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5a72", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Summary
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Lines</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0" }}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Customer</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {customer || <span style={{ color: "#2e3a52", fontStyle: "italic" }}>Not set</span>}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#4a5a72" }}>Subtotal</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0" }}>{money(subtotal)}</span>
              </div>
              {vatPercent > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#4a5a72" }}>VAT ({vatPercent}%)</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa3c0" }}>{money(vatAmount)}</span>
                </div>
              )}
              <div style={{ height: 1, background: "#1e2d45" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: "#8fa3c0", fontWeight: 600 }}>Total</span>
                <span style={{
                  fontSize: 28, fontWeight: 900, letterSpacing: "-0.8px",
                  color: grandTotal > 0 ? "#fff" : "#2e3a52",
                  transition: "color 0.2s",
                }}>{money(grandTotal)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={grandTotal === 0 || !customer.trim() || saving}
              style={{
                width: "100%", padding: "12px",
                background: grandTotal > 0 && customer.trim() && !saving
                  ? "linear-gradient(135deg,#2454ff,#173bcc)"
                  : "rgba(255,255,255,0.06)",
                border: "none", borderRadius: 10,
                color: grandTotal > 0 && customer.trim() && !saving ? "#fff" : "#2e3a52",
                fontSize: 14, fontWeight: 800,
                cursor: grandTotal > 0 && customer.trim() && !saving ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: grandTotal > 0 && customer.trim() && !saving ? "0 4px 16px rgba(36,84,255,0.4)" : "none",
              }}
            >
              <SvgIcon path={PATHS.check} size={15} strokeWidth={2.5} />
              {saving ? "Saving…" : editing ? "Save Changes" : "Save Draft"}
            </button>
          </div>
        </div>

      </div>
    </form>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function QuoteDetailModal({ quote, onClose, onStatusChange, onConvert, onEdit, companyName }: {
  quote: Quote; onClose: () => void;
  onStatusChange: (id: string, status: QuoteStatus) => Promise<void>;
  onConvert: (quote: Quote) => void;
  onEdit: (quote: Quote) => void;
  companyName: string;
}) {
  const nextStatus = NEXT_STATUS[quote.status];
  const days = daysUntilExpiry(quote);

  return (
    <Modal title={`Quotation ${quote.number}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header strip */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={quote.customer} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{quote.customer}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Issued {fmt(quote.issueDate)} · Valid until {fmt(quote.validUntil)}
                {quote.status === "SENT" && days > 0 && (
                  <span style={{ marginLeft: 6, color: days <= 5 ? "#dc2626" : "#d97706", fontWeight: 600 }}>
                    ({days}d left)
                  </span>
                )}
              </div>
            </div>
          </div>
          <StatusChip status={quote.status} />
        </div>

        {/* Line items table */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                {["Description", "Qty", "Unit Price", "Amount"].map((h, i) => (
                  <th key={h} style={{
                    padding: "9px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    textAlign: i > 0 ? "right" : "left", borderBottom: "1px solid var(--border)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{it.description}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{it.qty}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{money(it.unitPrice)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, fontWeight: 600 }}>{money(it.qty * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                <td colSpan={3} style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13 }}>Total</td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, fontSize: 16, color: "var(--primary, #2454ff)" }}>
                  {money(quote.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div style={{ background: "var(--bg)", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "var(--muted)", borderLeft: "3px solid var(--primary, #2454ff)" }}>
            <div style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notes</div>
            {quote.notes}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => { onEdit(quote); onClose(); }}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Edit
          </button>
          <button
            className="btn"
            onClick={() => downloadQuotePdf(quote, companyName)}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "#dc2626", borderColor: "#fecaca", background: "#fff5f5" }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Download PDF
          </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {nextStatus && (
              <button className="btn btn-primary" onClick={() => onStatusChange(quote.id, nextStatus).then(onClose).catch(console.error)}>
                {nextStatus === "SENT" ? "Mark as Sent" : "Mark as Accepted"}
              </button>
            )}
            {quote.status === "SENT" && (
              <button className="btn" style={{ color: "#dc2626", borderColor: "#fecaca" }}
                onClick={() => onStatusChange(quote.id, "DECLINED").then(onClose).catch(console.error)}>
                Mark Declined
              </button>
            )}
            <button className="btn" style={{ color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4" }}
              onClick={() => { onConvert(quote); onClose(); }}>
              Convert to Invoice
            </button>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type TabFilter = QuoteStatus | "ALL";

export default function QuotationsPage() {
  const navigate = useNavigate();
  const { currentCompany } = useAuth();
  const companyApi = useCompanyApi();
  const [quotes,     setQuotes]     = useState<Quote[]>([]);
  const [tabFilter,  setTabFilter]  = useState<TabFilter>("ALL");
  const [search,     setSearch]     = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [showEdit,   setShowEdit]   = useState<Quote | null>(null);
  const [selected,   setSelected]   = useState<Quote | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [focusIdx,   setFocusIdx]   = useState(-1);
  const listRowRefs  = useRef<(HTMLTableRowElement | null)[]>([]);

  useEffect(() => {
    if (!currentCompany) return;
    setLoading(true);
    companyApi.get<any[]>("/quotations")
      .then((rows) => setQuotes(rows.map(mapQuote)))
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompany?.id]);

  // Reset row cursor when list changes
  useEffect(() => { setFocusIdx(-1); listRowRefs.current = []; }, [quotes, tabFilter, search]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusIdx >= 0) listRowRefs.current[focusIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  async function handleSave(data: { customer: string; issueDate: string; validUntil: string; notes: string; vatPercent: number; items: QuoteItem[] }) {
    const raw = await companyApi.post<any>("/quotations", data);
    setQuotes((prev) => [mapQuote(raw), ...prev]);
  }

  async function handleUpdate(data: { customer: string; issueDate: string; validUntil: string; notes: string; vatPercent: number; items: QuoteItem[] }) {
    if (!showEdit) return;
    const raw = await companyApi.patch<any>(`/quotations/${showEdit.id}`, data);
    const updated = mapQuote(raw);
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
    setShowEdit(null);
  }

  async function handleStatusChange(id: string, status: QuoteStatus) {
    const raw = await companyApi.patch<any>(`/quotations/${id}/status`, { status });
    setQuotes((prev) => prev.map((q) => q.id === id ? mapQuote(raw) : q));
    if (selected?.id === id) setSelected(mapQuote(raw));
  }

  const counts: Record<TabFilter, number> = useMemo(() => {
    const c: Record<TabFilter, number> = { ALL: quotes.length, DRAFT: 0, SENT: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0 };
    quotes.forEach((q) => { c[q.status] = (c[q.status] ?? 0) + 1; });
    return c;
  }, [quotes]);

  const filtered = useMemo(() => {
    let list = tabFilter === "ALL" ? quotes : quotes.filter((q) => q.status === tabFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((qt) => qt.number.toLowerCase().includes(s) || qt.customer.toLowerCase().includes(s));
    }
    return list;
  }, [quotes, tabFilter, search]);

  useRegisterNewShortcut(() => setShowNew(true));

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (showNew || showEdit) return;

      // Arrow Down/Up flips through quotes while the detail modal is open
      if (selected) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const ci = filtered.findIndex((q) => q.id === selected.id);
          if (e.key === "ArrowDown" && ci < filtered.length - 1) setSelected(filtered[ci + 1]);
          if (e.key === "ArrowUp"   && ci > 0)                   setSelected(filtered[ci - 1]);
        }
        return;
      }

      // List cursor (PageDown/PageUp highlights row; Enter opens it)
      if (e.key === "PageDown") {
        e.preventDefault();
        setFocusIdx((prev) => Math.min(prev < 0 ? 0 : prev + 1, filtered.length - 1));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setFocusIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusIdx >= 0 && filtered[focusIdx]) {
        setSelected(filtered[focusIdx]);
      } else if (e.key === "Escape") {
        setFocusIdx(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, focusIdx, selected, showNew, showEdit]);

  function handleConvert(q: Quote) {
    navigate("/invoices/new", { state: { quote: { customer: q.customer, items: q.items, notes: q.notes } } });
  }

  // ── All hooks above early returns ─────────────────────────────────────────

  if (loading) {
    return <div className="muted" style={{ padding: 48, textAlign: "center" }}>Loading quotations…</div>;
  }

  if (showNew) {
    return (
      <NewQuoteView
        onBack={() => setShowNew(false)}
        onSave={handleSave}
      />
    );
  }

  if (showEdit) {
    return (
      <NewQuoteView
        editing={showEdit}
        onBack={() => setShowEdit(null)}
        onSave={handleUpdate}
      />
    );
  }

  // KPI stats
  const pendingValue   = quotes.filter((q) => q.status === "SENT").reduce((s, q) => s + q.total, 0);
  const acceptedValue  = quotes.filter((q) => q.status === "ACCEPTED").reduce((s, q) => s + q.total, 0);
  const conversionRate = quotes.length ? Math.round((counts.ACCEPTED / quotes.length) * 100) : 0;

  const TABS: { key: TabFilter; label: string }[] = [
    { key: "ALL",      label: "All" },
    { key: "DRAFT",    label: "Draft" },
    { key: "SENT",     label: "Sent" },
    { key: "ACCEPTED", label: "Accepted" },
    { key: "DECLINED", label: "Declined" },
    { key: "EXPIRED",  label: "Expired" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Page header ── */}
      <div style={{
        background: "linear-gradient(135deg, #1e2a45 0%, #2454ff 100%)",
        borderRadius: 16, padding: "28px 32px", marginBottom: 0,
        color: "#fff", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", bottom: -20, right: 80, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />

        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "7px 8px", display: "flex" }}>
                <SvgIcon path={PATHS.doc} size={20} />
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Quotations</h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
              Create, track, and convert customer quotations into invoices.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowNew(true)}
            style={{ background: "#fff", color: "#2454ff", border: "none", fontWeight: 700, fontSize: 13, padding: "10px 20px", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}
          >
            <SvgIcon path={PATHS.plus} size={14} stroke="#2454ff" strokeWidth={2.5} />
            New Quotation
          </button>
        </div>

        {/* Hero KPIs */}
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 24 }}>
          {[
            { label: "Total Quotes",  value: String(quotes.length), sub: "all time",          icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
            { label: "Pending Value", value: money(pendingValue),   sub: "awaiting response", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
            { label: "Won Value",     value: money(acceptedValue),  sub: "accepted quotes",   icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
            { label: "Conversion",    value: `${conversionRate}%`,  sub: "acceptance rate",   icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
          ].map((c) => (
            <div key={c.label} style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(4px)", borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={c.icon} />
                </svg>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7 }}>{c.label}</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{c.value}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Status tabs + search ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
          {TABS.map((t) => {
            const active = tabFilter === t.key;
            const cfg    = t.key !== "ALL" ? STATUS_CFG[t.key as QuoteStatus] : null;
            return (
              <button key={t.key} onClick={() => setTabFilter(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: active ? (cfg ? cfg.bg : "#2454ff") : "transparent",
                  color: active ? (cfg ? cfg.color : "#fff") : "var(--muted)",
                  transition: "background 0.15s, color 0.15s",
                }}>
                {t.label}
                <span style={{
                  background: active ? "rgba(0,0,0,0.1)" : "var(--bg)",
                  color: active ? "inherit" : "var(--muted)",
                  borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "1px 7px",
                }}>
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ position: "relative", minWidth: 220 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={11} cy={11} r={8} /><line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
          <input
            placeholder="Search by number or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, width: "100%" }}
          />
        </div>
      </div>

      {/* ── Results bar ── */}
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Showing <strong>{filtered.length}</strong> of <strong>{quotes.length}</strong> quotation{quotes.length !== 1 ? "s" : ""}
        {filtered.length > 0 && (
          <> · total value: <strong style={{ color: "var(--primary, #2454ff)" }}>{money(filtered.reduce((s, q) => s + q.total, 0))}</strong></>
        )}
      </div>

      {/* ── Quotations table ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "60px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              {search ? "No quotations match your search" : "No quotations yet"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
              {search ? "Try a different search term." : "Create your first quotation to start winning more business."}
            </div>
            {!search && (
              <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Quotation</button>
            )}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Number</th>
                <th>Customer</th>
                <th>Items</th>
                <th style={{ width: 120 }}>Issued</th>
                <th style={{ width: 130 }}>Valid Until</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 130, textAlign: "right" }}>Total</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, idx) => {
                const exp       = isExpired(q);
                const days      = daysUntilExpiry(q);
                const urgentSoon = q.status === "SENT" && days > 0 && days <= 5;
                const isFocused  = idx === focusIdx;
                return (
                  <tr
                    key={q.id}
                    ref={(el) => { listRowRefs.current[idx] = el; }}
                    style={{ cursor: "pointer", background: isFocused ? "rgba(36,84,255,0.06)" : undefined, outline: isFocused ? "2px solid #2454ff" : undefined, outlineOffset: "-2px" }}
                    onClick={() => setSelected(q)}
                  >
                    <td>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, background: "#eef2ff", color: "#2454ff", borderRadius: 6, padding: "3px 8px" }}>
                        {q.number}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={q.customer} />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{q.customer}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.items.slice(0, 2).map((it) => it.description).join(", ")}
                      {q.items.length > 2 && ` +${q.items.length - 2} more`}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmt(q.issueDate)}</td>
                    <td>
                      <div style={{ fontSize: 13, color: exp ? "#dc2626" : urgentSoon ? "#d97706" : "var(--muted)", fontWeight: (exp || urgentSoon) ? 600 : 400 }}>
                        {fmt(q.validUntil)}
                      </div>
                      {urgentSoon && <div style={{ fontSize: 10, color: "#d97706", fontWeight: 700, marginTop: 1 }}>Expires in {days}d</div>}
                      {exp && q.status === "SENT" && <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 700, marginTop: 1 }}>Expired</div>}
                    </td>
                    <td><StatusChip status={q.status} /></td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontSize: 14 }}>{money(q.total)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {NEXT_STATUS[q.status] && (
                          <button className="btn" onClick={() => handleStatusChange(q.id, NEXT_STATUS[q.status]!).catch(console.error)}
                            style={{ fontSize: 11, padding: "4px 10px" }}>
                            {NEXT_STATUS[q.status] === "SENT" ? "Send" : "Accept"}
                          </button>
                        )}
                        {q.status === "SENT" && (
                          <button className="btn" onClick={() => handleStatusChange(q.id, "DECLINED").catch(console.error)}
                            style={{ fontSize: 11, padding: "4px 10px", color: "#dc2626", borderColor: "#fecaca" }}>
                            Decline
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={6} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                    {filtered.length} quotation{filtered.length !== 1 ? "s" : ""}
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>
                    {money(filtered.reduce((s, q) => s + q.total, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {selected && (
        <QuoteDetailModal
          quote={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onConvert={handleConvert}
          onEdit={(q) => { setSelected(null); setShowEdit(q); }}
          companyName={currentCompany?.name ?? "DMXI"}
        />
      )}
    </div>
  );
}
