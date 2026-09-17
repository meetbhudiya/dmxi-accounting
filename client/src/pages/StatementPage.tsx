import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useCompanyApi } from "../api/useCompanyApi";
import type {
  Brand, Customer, Vendor,
  CustomerStatement, VendorStatement, BrandStatement, StatementLine,
} from "../api/types";
import { money, dateOnly } from "../lib/format";
import { downloadStatementPdf, type StatementExportMeta } from "../lib/exportPdf";
import { exportStatementExcel } from "../lib/exportExcel";

type Tab = "customer" | "vendor" | "brand";

function buildQuery(params: Record<string, string>) {
  const q = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return q ? `?${q}` : "";
}

// ── Icon ─────────────────────────────────────────────────────────────────────

function Ico({ d, size = 14, sw = 1.75 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const IC = {
  customer: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  vendor:   "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  brand:    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  pdf:      "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  excel:    "M3 3h18v18H3zM3 9h18M9 21V9",
  print:    "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  ledger:   "M9 12h6m-6 4h6M9 8h6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  filter:   "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  arrow:    "M7 17l9.2-9.2M17 17V7H7",
};

// ── Type badge ────────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Invoice:  { bg: "#dbeafe", color: "#1e40af", border: "#3b82f6" },
  Receipt:  { bg: "#dcfce7", color: "#15803d", border: "#22c55e" },
  Payment:  { bg: "#dcfce7", color: "#15803d", border: "#22c55e" },
  Purchase: { bg: "#fef3c7", color: "#92400e", border: "#f59e0b" },
  Expense:  { bg: "#fee2e2", color: "#991b1b", border: "#f87171" },
};

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLE[type] ?? { bg: "#f1f5f9", color: "#475569", border: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px 2px 6px",
      borderRadius: 4,
      borderLeft: `3px solid ${s.border}`,
      background: s.bg,
      color: s.color,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>{type}</span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StatementPage() {
  const [tab, setTab] = useState<Tab>("customer");

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "customer", label: "Customer Statement", icon: IC.customer },
    { key: "vendor",   label: "Vendor Statement",   icon: IC.vendor },
    { key: "brand",    label: "Brand Statement",    icon: IC.brand },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #0a1628 0%, #0f2040 100%)",
        borderRadius: 14,
        padding: "22px 28px 0",
        marginBottom: 22,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background texture */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(255,255,255,0.6) 24px, rgba(255,255,255,0.6) 25px), repeating-linear-gradient(90deg, transparent, transparent 24px, rgba(255,255,255,0.6) 24px, rgba(255,255,255,0.6) 25px)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative" }}>
          {/* Eyebrow */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ color: "#4a6fa5", display: "flex" }}><Ico d={IC.ledger} size={13} /></div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa5", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              DMXI · Accounting
            </span>
          </div>

          {/* Title */}
          <h1 style={{
            margin: "0 0 2px",
            fontSize: 24, fontWeight: 800, color: "#e8ecf4",
            letterSpacing: "-0.5px",
          }}>
            Subsidiary Ledger
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "#4a6fa5" }}>
            Detailed transaction history and running balance by account
          </p>

          {/* Tabs — flush to bottom of header */}
          <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "10px 20px",
                  border: "none",
                  borderBottom: tab === t.key ? "2px solid #4d85e8" : "2px solid transparent",
                  background: tab === t.key ? "rgba(77,133,232,0.12)" : "transparent",
                  color: tab === t.key ? "#90b8f8" : "#4a6fa5",
                  fontSize: 12.5, fontWeight: tab === t.key ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  borderRadius: "8px 8px 0 0",
                  marginBottom: -1,
                }}
              >
                <Ico d={t.icon} size={13} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      {tab === "customer" && <CustomerLedger />}
      {tab === "vendor"   && <VendorLedger />}
      {tab === "brand"    && <BrandLedger />}
    </div>
  );
}

// ── Customer Statement ────────────────────────────────────────────────────────

function CustomerLedger() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    companyApi.get<Customer[]>("/customers").then(setCustomers).catch(() => {});
  }, [companyApi]);

  useEffect(() => {
    if (!selected) { setStatement(null); return; }
    setLoading(true); setError(null);
    companyApi
      .get<CustomerStatement>(`/customers/${selected}/statement${buildQuery({ from, to })}`)
      .then(setStatement)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected, from, to, companyApi]);

  return (
    <LedgerShell
      entityLabel="Customer"
      entityIcon={IC.customer}
      entitySelect={
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ fontSize: 13, minWidth: 260 }}>
          <option value="">— Select a customer —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      }
      from={from} to={to} onFrom={setFrom} onTo={setTo}
      loading={loading} error={error}
      statement={statement ? {
        title: `${statement.customer.name}`,
        subtitle: from || to ? `${from || "Beginning"} → ${to || "Today"}` : "All transactions",
        lines: statement.lines,
        debitHeader: "Invoice",
        creditHeader: "Receipt",
        totalDebit: statement.totalDebit,
        totalCredit: statement.totalCredit,
        balance: statement.balance,
        balanceLabel: "Balance Due",
        showVendor: false,
        companyName: currentCompany?.name ?? "My Company",
      } : null}
    />
  );
}

// ── Vendor Statement ──────────────────────────────────────────────────────────

function VendorLedger() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statement, setStatement] = useState<VendorStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    companyApi.get<Vendor[]>("/vendors").then(setVendors).catch(() => {});
  }, [companyApi]);

  useEffect(() => {
    if (!selected) { setStatement(null); return; }
    setLoading(true); setError(null);
    companyApi
      .get<VendorStatement>(`/vendors/${selected}/statement${buildQuery({ from, to })}`)
      .then(setStatement)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected, from, to, companyApi]);

  return (
    <LedgerShell
      entityLabel="Vendor"
      entityIcon={IC.vendor}
      entitySelect={
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ fontSize: 13, minWidth: 260 }}>
          <option value="">— Select a vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      }
      from={from} to={to} onFrom={setFrom} onTo={setTo}
      loading={loading} error={error}
      statement={statement ? {
        title: `${statement.vendor.name}`,
        subtitle: from || to ? `${from || "Beginning"} → ${to || "Today"}` : "All transactions",
        lines: statement.lines,
        debitHeader: "Payment",
        creditHeader: "Charge",
        totalDebit: statement.totalDebit,
        totalCredit: statement.totalCredit,
        balance: statement.balance,
        balanceLabel: "Balance Payable",
        showVendor: false,
        companyName: currentCompany?.name ?? "My Company",
      } : null}
    />
  );
}

// ── Brand Statement ───────────────────────────────────────────────────────────

function BrandLedger() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statement, setStatement] = useState<BrandStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    companyApi.get<Brand[]>("/brands").then(setBrands).catch(() => {});
    companyApi.get<Vendor[]>("/vendors").then(setVendors).catch(() => {});
  }, [companyApi]);

  useEffect(() => {
    if (!selected) { setStatement(null); return; }
    setLoading(true); setError(null);
    companyApi
      .get<BrandStatement>(`/brands/${selected}/statement${buildQuery({ from, to, vendorId })}`)
      .then(setStatement)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected, from, to, vendorId, companyApi]);

  const selectedBrandName  = brands.find((b) => b.id === selected)?.name;
  const selectedVendorName = vendors.find((v) => v.id === vendorId)?.name;

  const vendorExtra = (
    <div>
      <div style={lbl}>Vendor filter</div>
      <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={{ fontSize: 13, minWidth: 180 }}>
        <option value="">All vendors</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    </div>
  );

  return (
    <LedgerShell
      entityLabel="Brand"
      entityIcon={IC.brand}
      entitySelect={
        brands.length === 0
          ? <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No brands yet. Add brands from the Products page.</p>
          : <select value={selected} onChange={(e) => { setSelected(e.target.value); setVendorId(""); }} style={{ fontSize: 13, minWidth: 260 }}>
              <option value="">— Select a brand —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
      }
      from={from} to={to} onFrom={setFrom} onTo={setTo}
      extraFilter={vendorExtra}
      loading={loading} error={error}
      statement={statement ? {
        title: selectedBrandName ?? "Brand",
        subtitle: [
          selectedVendorName ? `Vendor: ${selectedVendorName}` : null,
          from || to ? `${from || "Beginning"} → ${to || "Today"}` : null,
        ].filter(Boolean).join("  ·  ") || "All transactions",
        lines: statement.lines,
        debitHeader: "Payment",
        creditHeader: "Purchase",
        totalDebit: statement.totalDebit,
        totalCredit: statement.totalCredit,
        balance: statement.balance,
        balanceLabel: "Balance Payable",
        showVendor: true,
        companyName: currentCompany?.name ?? "My Company",
      } : null}
    />
  );
}

// ── Shared label style ────────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: "var(--muted)",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
};

// ── Ledger shell (selector + filter + table) ──────────────────────────────────

interface StatementData {
  title: string;
  subtitle: string;
  lines: StatementLine[];
  debitHeader: string;
  creditHeader: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  balanceLabel: string;
  showVendor: boolean;
  companyName: string;
}

function LedgerShell({
  entityLabel, entityIcon, entitySelect,
  from, to, onFrom, onTo, extraFilter,
  loading, error, statement,
}: {
  entityLabel: string;
  entityIcon: string;
  entitySelect: React.ReactNode;
  from: string; to: string;
  onFrom: (v: string) => void; onTo: (v: string) => void;
  extraFilter?: React.ReactNode;
  loading: boolean;
  error: string | null;
  statement: StatementData | null;
}) {
  const hasFilter = from || to;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Control card */}
      <div className="card" style={{ padding: "18px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>

          {/* Entity selector */}
          <div>
            <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}>
              <Ico d={entityIcon} size={11} />
              {entityLabel}
            </div>
            {entitySelect}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 36, background: "var(--border)", alignSelf: "flex-end", flexShrink: 0 }} />

          {/* Date range */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <div>
              <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}>
                <Ico d={IC.calendar} size={11} />
                From date
              </div>
              <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} style={{ fontSize: 13, width: 155 }} />
            </div>
            <div style={{ paddingBottom: 8, color: "var(--muted)", fontSize: 13 }}>→</div>
            <div>
              <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}>
                <Ico d={IC.calendar} size={11} />
                To date
              </div>
              <input type="date" value={to} onChange={(e) => onTo(e.target.value)} style={{ fontSize: 13, width: 155 }} />
            </div>
          </div>

          {extraFilter && (
            <>
              <div style={{ width: 1, height: 36, background: "var(--border)", alignSelf: "flex-end", flexShrink: 0 }} />
              {extraFilter}
            </>
          )}

          {hasFilter && (
            <button
              className="btn"
              onClick={() => { onFrom(""); onTo(""); }}
              style={{ fontSize: 11, padding: "5px 12px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2", alignSelf: "flex-end" }}
            >
              ✕ Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      {error   && <div className="error-text">{error}</div>}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0", color: "var(--muted)", fontSize: 13 }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            border: "2px solid var(--border)", borderTopColor: "var(--primary)",
            animation: "spin 0.7s linear infinite",
          }} />
          Loading statement…
        </div>
      )}

      {/* Statement */}
      {statement && !loading && (
        <StatementTable {...statement} />
      )}

      {/* Empty prompt */}
      {!statement && !loading && !error && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "60px 24px", color: "var(--muted)", textAlign: "center",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "var(--bg, #f8fafc)",
            border: "1.5px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--muted)", marginBottom: 16,
          }}>
            <Ico d={IC.ledger} size={24} sw={1.25} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
            Select an account to view the ledger
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 340 }}>
            Choose a {entityLabel.toLowerCase()} above to see a full transaction history with running balance.
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Statement table ───────────────────────────────────────────────────────────

function StatementTable({
  title, subtitle, lines, debitHeader, creditHeader,
  totalDebit, totalCredit, balance, balanceLabel, showVendor, companyName,
}: StatementData) {
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const meta: StatementExportMeta = {
    title, subtitle, debitHeader, creditHeader, balanceLabel,
    totalDebit, totalCredit, balance, showVendor,
  };

  async function handlePdf() {
    setExporting("pdf");
    try { downloadStatementPdf(lines, meta, companyName); }
    finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try { await exportStatementExcel(lines, meta, companyName); }
    finally { setExporting(null); }
  }

  const colCount = (showVendor ? 1 : 0) + 8;
  const isCredit = balance <= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Debit total */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ height: 3, background: "#ef4444" }} />
          <div style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "#ef4444", display: "flex" }}><Ico d="M12 5v14M5 12h14" size={11} /></span>
              {debitHeader} Total · DR
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#d32f2f", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>
              {money(totalDebit)}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{lines.filter(l => l.debit > 0).length} transaction{lines.filter(l => l.debit > 0).length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Credit total */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ height: 3, background: "#22c55e" }} />
          <div style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "#22c55e", display: "flex" }}><Ico d="M20 12H4" size={11} /></span>
              {creditHeader} Total · CR
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#2e7d32", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>
              {money(totalCredit)}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{lines.filter(l => l.credit > 0).length} transaction{lines.filter(l => l.credit > 0).length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Balance */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ height: 3, background: isCredit ? "#22c55e" : "#ef4444" }} />
          <div style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: isCredit ? "#22c55e" : "#ef4444", display: "flex" }}><Ico d="M3 12h18M3 6h18M3 18h18" size={11} /></span>
              {balanceLabel}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: isCredit ? "#2e7d32" : "#d32f2f", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>
              {money(Math.abs(balance))}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              {isCredit ? "Fully settled / in credit" : `Outstanding — ${lines.length} line${lines.length !== 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
      </div>

      {/* Table header row: title + exports */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
            Account Statement
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
            <Ico d={IC.calendar} size={11} />
            {subtitle}
          </div>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button
            className="btn" onClick={handlePdf}
            disabled={exporting === "pdf" || lines.length === 0}
            style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2", padding: "7px 14px" }}
          >
            <Ico d={IC.pdf} size={13} />
            {exporting === "pdf" ? "Generating…" : "PDF"}
          </button>
          <button
            className="btn" onClick={handleExcel}
            disabled={exporting === "excel" || lines.length === 0}
            style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4", padding: "7px 14px" }}
          >
            <Ico d={IC.excel} size={13} />
            {exporting === "excel" ? "Generating…" : "Excel"}
          </button>
          <button
            className="btn" onClick={() => window.print()}
            style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px" }}
          >
            <Ico d={IC.print} size={13} />
            Print
          </button>
        </div>
      </div>

      {/* Ledger table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 820, borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{
                background: "linear-gradient(135deg, #0a1628 0%, #0f2040 100%)",
              }}>
                {[
                  { label: "Date",        align: "left",  w: 100 },
                  { label: "Voucher No.", align: "left",  w: 130 },
                  { label: "Ref No.",     align: "left",  w: 110 },
                  { label: "Type",        align: "left",  w: 110 },
                  ...(showVendor ? [{ label: "Vendor", align: "left" as const, w: 120 }] : []),
                  { label: "Description", align: "left",  w: undefined },
                  { label: debitHeader,   align: "right", w: 120 },
                  { label: creditHeader,  align: "right", w: 120 },
                  { label: "Balance",     align: "right", w: 120 },
                ].map((col) => (
                  <th key={col.label} style={{
                    padding: "11px 14px",
                    fontSize: 10.5, fontWeight: 700,
                    color: col.label === "Balance" ? "#90b8f8" : "#6b8ab5",
                    textAlign: col.align as "left" | "right",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    width: col.w,
                    // Balance column tint in header
                    background: col.label === "Balance" ? "rgba(77,133,232,0.15)" : undefined,
                    borderBottom: "none",
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: "center", padding: "40px 24px", color: "var(--muted)", fontSize: 13 }}>
                    No transactions found for the selected period.
                  </td>
                </tr>
              )}
              {lines.map((l, idx) => {
                const isVoid = l.type === "Void" || l.type === "Reversal";
                return (
                  <tr
                    key={l.id}
                    style={{
                      background: idx % 2 === 0 ? "var(--surface, #fff)" : "var(--bg, #f8fafc)",
                      opacity: isVoid ? 0.55 : 1,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--primary-bg, #eef2ff)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? "var(--surface, #fff)" : "var(--bg, #f8fafc)"; }}
                  >
                    {/* Date */}
                    <td style={{ padding: "9px 14px", fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>
                      {dateOnly(l.date)}
                    </td>

                    {/* Voucher */}
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                      <span style={{
                        fontFamily: "ui-monospace, 'Cascadia Code', Menlo, monospace",
                        fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                        background: "var(--bg, #f8fafc)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "2px 7px",
                        color: "var(--text)",
                        textDecoration: isVoid ? "line-through" : undefined,
                      }}>
                        {l.voucherNo}
                      </span>
                    </td>

                    {/* Ref */}
                    <td style={{ padding: "9px 14px", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
                      {l.reference
                        ? <span style={{ fontFamily: "ui-monospace, 'Cascadia Code', Menlo, monospace", color: "#2454ff", fontWeight: 600 }}>{l.reference}</span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>

                    {/* Type */}
                    <td style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                      <TypeBadge type={l.type} />
                    </td>

                    {/* Vendor */}
                    {showVendor && (
                      <td style={{ padding: "9px 14px", fontSize: 12.5, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                        {l.vendor ?? "—"}
                      </td>
                    )}

                    {/* Description */}
                    <td style={{ padding: "9px 14px", fontSize: 12.5, color: "var(--muted)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>
                      {l.description}
                    </td>

                    {/* Debit */}
                    <td style={{ padding: "9px 14px", textAlign: "right", borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>
                      {l.debit > 0
                        ? <span style={{ fontWeight: 700, color: "#d32f2f", fontSize: 13, textDecoration: isVoid ? "line-through" : undefined }}>{money(l.debit)}</span>
                        : <span style={{ color: "var(--border)", fontSize: 12 }}>—</span>}
                    </td>

                    {/* Credit */}
                    <td style={{ padding: "9px 14px", textAlign: "right", borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>
                      {l.credit > 0
                        ? <span style={{ fontWeight: 700, color: "#2e7d32", fontSize: 13, textDecoration: isVoid ? "line-through" : undefined }}>{money(l.credit)}</span>
                        : <span style={{ color: "var(--border)", fontSize: 12 }}>—</span>}
                    </td>

                    {/* Running balance — persistent tint column */}
                    <td style={{
                      padding: "9px 14px", textAlign: "right",
                      background: "var(--bal-col, rgba(77,133,232,0.06))",
                      borderBottom: "1px solid var(--border)",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: l.balance > 0 ? "#d32f2f" : "#2e7d32",
                        textDecoration: isVoid ? "line-through" : undefined,
                      }}>
                        {money(l.balance)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {lines.length > 0 && (
              <tfoot>
                <tr style={{ background: "var(--bg, #f8fafc)" }}>
                  <td colSpan={colCount - 3} style={{
                    padding: "12px 14px", textAlign: "right",
                    fontSize: 11, fontWeight: 700, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    borderTop: "2px solid var(--border)",
                  }}>
                    Totals
                  </td>
                  <td style={{
                    padding: "12px 14px", textAlign: "right",
                    fontWeight: 800, fontSize: 14, color: "#d32f2f",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid var(--border)",
                  }}>
                    {money(totalDebit)}
                  </td>
                  <td style={{
                    padding: "12px 14px", textAlign: "right",
                    fontWeight: 800, fontSize: 14, color: "#2e7d32",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid var(--border)",
                  }}>
                    {money(totalCredit)}
                  </td>
                  <td style={{
                    padding: "12px 14px", textAlign: "right",
                    fontWeight: 800, fontSize: 14,
                    color: balance <= 0 ? "#2e7d32" : "#d32f2f",
                    fontVariantNumeric: "tabular-nums",
                    background: "var(--bal-col, rgba(77,133,232,0.06))",
                    borderTop: "2px solid #2352cc",
                    boxShadow: "inset 0 -3px 0 #2352cc",
                  }}>
                    {money(balance)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Transaction count footer */}
      {lines.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {lines.length} transaction{lines.length !== 1 ? "s" : ""} · Showing all
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {balanceLabel}: <strong style={{ color: balance <= 0 ? "#2e7d32" : "#d32f2f" }}>{money(Math.abs(balance))}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
