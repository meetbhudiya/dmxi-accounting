import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { DashboardSummary } from "../api/types";
import { money } from "../lib/format";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

const ICONS: Record<string, string> = {
  invoice:    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  receivable: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  expense:    "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  payable:    "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  customers:  "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  vendors:    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

interface KpiConfig {
  key: keyof DashboardSummary;
  label: string;
  icon: string;
  color: string;
  bg: string;
  isMoney?: boolean;
  sub?: string;
  href: string;
}

const KPI_CARDS: KpiConfig[] = [
  { key: "openInvoiceCount",  label: "Open Invoices",        icon: "invoice",    color: "#2454ff", bg: "#eff3ff", isMoney: false, sub: "awaiting payment", href: "/invoices" },
  { key: "totalReceivable",   label: "Accounts Receivable",  icon: "receivable", color: "#0ea265", bg: "#edfaf3", isMoney: true,  sub: "total outstanding", href: "/invoices" },
  { key: "unpaidExpenseCount",label: "Unpaid Expenses",      icon: "expense",    color: "#d97706", bg: "#fffbeb", isMoney: false, sub: "bills due",          href: "/expenses" },
  { key: "totalPayable",      label: "Accounts Payable",     icon: "payable",    color: "#dc2626", bg: "#fef2f2", isMoney: true,  sub: "total owed",         href: "/expenses" },
  { key: "customerCount",     label: "Customers",            icon: "customers",  color: "#7c3aed", bg: "#f5f3ff", isMoney: false, sub: "active accounts",    href: "/invoices" },
  { key: "vendorCount",       label: "Vendors",              icon: "vendors",    color: "#0891b2", bg: "#ecfeff", isMoney: false, sub: "registered",         href: "/expenses" },
];

export default function DashboardPage() {
  const companyApi = useCompanyApi();
  const { currentCompany, user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null); setError(null);
    companyApi.get<DashboardSummary>("/reports/dashboard")
      .then((d) => !cancelled && setSummary(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [companyApi]);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Hero banner ─────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 14,
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        padding: "28px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* decorative circles */}
        <div style={{ position: "absolute", right: -40, top: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(36,84,255,0.12)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 60, bottom: -60, width: 160, height: 160, borderRadius: "50%", background: "rgba(36,84,255,0.07)", pointerEvents: "none" }} />
        <div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.03em" }}>{formatDate()}</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            {greeting()}, {firstName} 👋
          </h1>
          <div style={{ marginTop: 6, fontSize: 14, color: "#94a3b8" }}>
            {currentCompany?.name} · {currentCompany?.role}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/invoices/new" style={{ textDecoration: "none" }}>
            <button style={{ background: "#2454ff", border: "none", borderRadius: 8, color: "#fff", padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="invoice" size={16} /> New Invoice
            </button>
          </Link>
          <Link to="/expenses" state={{ openNew: true }} style={{ textDecoration: "none" }}>
            <button style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="expense" size={16} /> New Expense
            </button>
          </Link>
          <Link to="/purchases" state={{ openNew: true }} style={{ textDecoration: "none" }}>
            <button style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="vendors" size={16} /> New Purchase
            </button>
          </Link>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* ── KPI cards ───────────────────────────────────────────────── */}
      {summary ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {KPI_CARDS.map((card) => {
            const raw = summary[card.key];
            const display = card.isMoney ? money(String(raw)) : String(raw);
            return (
              <Link key={card.key} to={card.href} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.08)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                        {card.label}
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>
                        {display}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{card.sub}</div>
                    </div>
                    <div style={{ background: card.bg, color: card.color, borderRadius: 10, padding: 10, flexShrink: 0 }}>
                      <Icon name={card.icon} size={22} />
                    </div>
                  </div>
                  {/* accent bar */}
                  <div style={{ height: 3, borderRadius: 99, background: `linear-gradient(90deg, ${card.color} 0%, ${card.bg} 100%)` }} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        !error && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", height: 110, opacity: 0.4, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        )
      )}

      {/* ── Financial health + Quick nav ────────────────────────────── */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* AR vs AP */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 18, color: "var(--text)" }}>Financial Position</div>
            {[
              { label: "Receivables", amount: Number(summary.totalReceivable), color: "#0ea265", bg: "#edfaf3" },
              { label: "Payables",    amount: Number(summary.totalPayable),    color: "#dc2626", bg: "#fef2f2" },
            ].map((row) => {
              const max = Math.max(Number(summary.totalReceivable), Number(summary.totalPayable), 1);
              const pct = Math.round((row.amount / max) * 100);
              return (
                <div key={row.label} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{row.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>{money(row.amount)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--bg)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: row.color, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Net Position</span>
              {(() => {
                const net = Number(summary.totalReceivable) - Number(summary.totalPayable);
                return (
                  <span style={{ fontWeight: 800, fontSize: 16, color: net >= 0 ? "#0ea265" : "#dc2626" }}>
                    {net >= 0 ? "+" : ""}{money(net)}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Quick nav */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>Quick Navigation</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Invoices",   sub: `${summary.openInvoiceCount} open`,       href: "/invoices",   icon: "invoice",    color: "#2454ff", bg: "#eff3ff" },
                { label: "Expenses",   sub: `${summary.unpaidExpenseCount} unpaid`,    href: "/expenses",   icon: "expense",    color: "#d97706", bg: "#fffbeb" },
                { label: "Purchases",  sub: "manage stock purchases",                  href: "/purchases",  icon: "vendors",    color: "#0891b2", bg: "#ecfeff" },
                { label: "Customers",  sub: `${summary.customerCount} accounts`,       href: "/invoices",   icon: "customers",  color: "#7c3aed", bg: "#f5f3ff" },
                { label: "Reports",    sub: "P&L · Balance Sheet · Cash Flow",         href: "/reports",    icon: "receivable", color: "#0ea265", bg: "#edfaf3" },
                { label: "Ledger",     sub: "journal entries & accounts",              href: "/ledger",     icon: "payable",    color: "#64748b", bg: "#f1f5f9" },
              ].map((item) => (
                <Link key={item.label} to={item.href} style={{ textDecoration: "none" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: 8,
                    transition: "background 0.15s",
                    cursor: "pointer",
                  }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <div style={{ background: item.bg, color: item.color, borderRadius: 8, padding: 7, flexShrink: 0 }}>
                      <Icon name={item.icon} size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{item.sub}</div>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 16 }}>›</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tips (shown only when no data yet) ──────────────────────── */}
      {summary && summary.openInvoiceCount === 0 && summary.customerCount === 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "var(--text)" }}>Getting started</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { step: "1", title: "Add customers",  body: "Go to Invoices → Customers to add your first client.",         icon: "customers",  color: "#7c3aed", bg: "#f5f3ff" },
              { step: "2", title: "Create invoices", body: "Issue a tax invoice and track payments automatically.",        icon: "invoice",    color: "#2454ff", bg: "#eff3ff" },
              { step: "3", title: "Track expenses",  body: "Record bills, purchases and set expenses as paid or unpaid.", icon: "expense",    color: "#d97706", bg: "#fffbeb" },
            ].map((tip) => (
              <div key={tip.step} style={{ background: "var(--bg)", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ background: tip.bg, color: tip.color, borderRadius: 8, padding: 7 }}>
                    <Icon name={tip.icon} size={18} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{tip.title}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{tip.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
