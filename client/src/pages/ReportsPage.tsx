import { useEffect, useState, useRef } from "react";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { BalanceSheet, CashFlow, ProfitAndLoss, TrialBalance } from "../api/types";
import { money } from "../lib/format";
import { exportPnlExcel, exportBalanceSheetExcel, exportCashFlowExcel, exportTrialBalanceExcel, exportStockReportExcel } from "../lib/exportExcel";
import { exportPnlPdf, exportBalanceSheetPdf, exportCashFlowPdf, exportTrialBalancePdf } from "../lib/exportPdf";

type Tab = "pnl" | "balance" | "cashflow" | "trial" | "budget" | "stock";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "pnl",     label: "Profit & Loss",  icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { key: "balance", label: "Balance Sheet",   icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" },
  { key: "cashflow",label: "Cash Flow",       icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "trial",   label: "Trial Balance",   icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { key: "budget",  label: "Budget vs Actual", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { key: "stock",   label: "Stock Report",     icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
];

const TYPE_COLOR: Record<string, { color: string; bg: string; label: string }> = {
  ASSET:     { color: "#2454ff", bg: "#eff3ff", label: "Asset" },
  LIABILITY: { color: "#dc2626", bg: "#fef2f2", label: "Liability" },
  EQUITY:    { color: "#7c3aed", bg: "#f5f3ff", label: "Equity" },
  REVENUE:   { color: "#0ea265", bg: "#edfaf3", label: "Revenue" },
  EXPENSE:   { color: "#d97706", bg: "#fffbeb", label: "Expense" },
};

function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function startOfYear() { return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10); }
function today()       { return new Date().toISOString().slice(0, 10); }

function ExportButtons({ onExcel, onPdf }: { onExcel: () => void; onPdf: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button className="btn" onClick={onExcel} style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5, color: "#16a34a", borderColor: "#bbf7d0" }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Excel
      </button>
      <button className="btn" onClick={onPdf} style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5, color: "#dc2626", borderColor: "#fecaca" }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        PDF
      </button>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom(v: string): void; onTo(v: string): void }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ margin: 0, fontSize: 12 }}>
        From
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} style={{ width: 150 }} />
      </label>
      <label style={{ margin: 0, fontSize: 12 }}>
        To
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} style={{ width: 150 }} />
      </label>
    </div>
  );
}

function ReportHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function SectionHead({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ padding: "10px 20px", background: color + "18", borderBottom: `2px solid ${color}30`, fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>
      {label}
    </div>
  );
}

function LineRow({ code, name, value, muted }: { code?: string; name: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px", borderBottom: "1px solid var(--border)", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {code && <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted)", background: "var(--bg)", padding: "1px 6px", borderRadius: 4 }}>{code}</span>}
        <span style={{ fontSize: 13, color: muted ? "var(--muted)" : "var(--text)" }}>{name}</span>
      </div>
      <span style={{ fontWeight: 600, fontSize: 13, color: muted ? "var(--muted)" : "var(--text)", whiteSpace: "nowrap" }}>{money(value)}</span>
    </div>
  );
}

function TotalRow({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: highlight ? `2px solid ${color ?? "var(--primary)"}` : "1px solid var(--border)" }}>
      <span style={{ fontWeight: 700, fontSize: highlight ? 15 : 13, color: color ?? "var(--text)" }}>{label}</span>
      <span style={{ fontWeight: 800, fontSize: highlight ? 16 : 14, color: color ?? "var(--text)" }}>{money(value)}</span>
    </div>
  );
}

function Empty() {
  return <div style={{ padding: "20px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>No activity</div>;
}

// ─── Monthly P&L chart ────────────────────────────────────────────────────────

interface MonthData {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
  netIncome: number;
}

function yLabel(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

function niceMax(raw: number) {
  if (raw <= 0) return 1000;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.ceil(raw / mag) * mag;
}

function PnlBarChart({ months }: { months: MonthData[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ px: number; py: number; d: MonthData } | null>(null);

  if (months.length === 0) return null;

  // Layout constants (viewBox units)
  const PL = 62, PR = 20, PT = 18, PB = 38;
  const VW = 800, VH = 264;
  const IW = VW - PL - PR;
  const IH = VH - PT - PB;

  const maxRaw = Math.max(...months.flatMap((m) => [m.revenue, m.expenses]), 1);
  const yMax   = niceMax(maxRaw);
  const toY    = (v: number) => PT + IH - Math.max(0, (v / yMax) * IH);
  const toYNet = (v: number) => PT + IH - (v / yMax) * IH;

  const groupW = IW / months.length;
  const barW   = Math.max(Math.min(groupW * 0.28, 26), 5);
  const gapX   = (i: number) => PL + i * groupW + groupW / 2;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  const netPath = months
    .map((m, i) => `${i === 0 ? "M" : "L"}${gapX(i).toFixed(1)},${toYNet(m.netIncome).toFixed(1)}`)
    .join(" ");

  return (
    <div style={{ position: "relative" }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12, paddingLeft: PL }}>
        {[
          { color: "#10b981", label: "Revenue",   dot: false },
          { color: "#f59e0b", label: "Expenses",  dot: false },
          { color: "#2454ff", label: "Net Income", dot: true },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>
            {l.dot ? (
              <svg width={22} height={10}>
                <line x1={0} y1={5} x2={22} y2={5} stroke={l.color} strokeWidth={2} strokeDasharray="4 2" />
                <circle cx={11} cy={5} r={3} fill={l.color} stroke="white" strokeWidth={1.5} />
              </svg>
            ) : (
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: l.color }} />
            )}
            {l.label}
          </div>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        onMouseLeave={() => setTip(null)}
      >
        {/* Grid lines */}
        {gridVals.map((v) => (
          <g key={v}>
            <line
              x1={PL} y1={toY(v)} x2={VW - PR} y2={toY(v)}
              stroke="var(--border)" strokeWidth={v === 0 ? 1.5 : 1}
            />
            <text x={PL - 7} y={toY(v)} textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill="var(--muted)" fontFamily="inherit">
              {yLabel(v)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {months.map((m, i) => {
          const cx    = gapX(i);
          const revX  = cx - barW - 2;
          const expX  = cx + 2;
          const baseY = toY(0);
          const revH  = Math.max(baseY - toY(m.revenue),  0);
          const expH  = Math.max(baseY - toY(m.expenses), 0);
          return (
            <g key={m.month}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) setTip({ px: e.clientX - rect.left, py: e.clientY - rect.top, d: m });
              }}
            >
              {/* Hover hit area */}
              <rect x={cx - groupW / 2} y={PT} width={groupW} height={IH} fill="transparent" />

              {/* Revenue bar */}
              {revH > 0 && (
                <rect x={revX} y={toY(m.revenue)} width={barW} height={revH}
                  fill="#10b981" rx={3} />
              )}
              {/* Expense bar */}
              {expH > 0 && (
                <rect x={expX} y={toY(m.expenses)} width={barW} height={expH}
                  fill="#f59e0b" rx={3} />
              )}

              {/* X-axis month label */}
              <text x={cx} y={VH - PB + 16} textAnchor="middle"
                fontSize={10} fill="var(--muted)" fontFamily="inherit">
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Net income line + dots */}
        {months.length > 1 && (
          <path d={netPath} fill="none" stroke="#2454ff" strokeWidth={2} strokeDasharray="5 3" />
        )}
        {months.map((m, i) => (
          <circle key={m.month} cx={gapX(i)} cy={toYNet(m.netIncome)}
            r={3.5} fill={m.netIncome >= 0 ? "#2454ff" : "#dc2626"}
            stroke="white" strokeWidth={1.5} style={{ pointerEvents: "none" }}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {tip && (
        <div style={{
          position: "absolute",
          left: Math.min(tip.px + 14, 620),
          top: Math.max(tip.py - 80, 4),
          background: "#0d1829",
          color: "#e2eaf4",
          borderRadius: 10,
          padding: "11px 14px",
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 10,
          minWidth: 160,
          boxShadow: "0 8px 24px rgb(0 0 0 / 0.2)",
        }}>
          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 12.5, color: "#fff" }}>{tip.d.label}</div>
          {[
            { label: "Revenue",    value: tip.d.revenue,   color: "#10b981" },
            { label: "Expenses",   value: tip.d.expenses,  color: "#f59e0b" },
            { label: "Net Income", value: tip.d.netIncome, color: tip.d.netIncome >= 0 ? "#34d399" : "#f87171" },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4, alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#8fa3c0" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block", flexShrink: 0 }} />
                {r.label}
              </span>
              <span style={{ fontWeight: 700, color: r.color }}>{money(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profit & Loss ────────────────────────────────────────────────────────────

function PnlReport() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [from, setFrom] = useState(startOfYear());
  const [to,   setTo]   = useState(today());
  const [data, setData] = useState<ProfitAndLoss | null>(null);
  const [err,  setErr]  = useState<string | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);

  useEffect(() => {
    setErr(null);
    companyApi.get<ProfitAndLoss>(`/reports/profit-and-loss?from=${from}&to=${to}`)
      .then(setData).catch((e) => setErr(e.message));
  }, [companyApi, from, to]);

  useEffect(() => {
    companyApi.get<{ months: MonthData[] }>(`/reports/profit-and-loss-monthly?from=${from}&to=${to}`)
      .then((r) => setMonthlyData(r.months))
      .catch(() => setMonthlyData([]));
  }, [companyApi, from, to]);

  const netPositive = data ? Number(data.netIncome) >= 0 : true;
  const compName = currentCompany?.name ?? "DMXI";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <ReportHeader title="Profit & Loss" subtitle={`${from} → ${to}`} />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {data && <ExportButtons onExcel={() => exportPnlExcel(data, compName)} onPdf={() => exportPnlPdf(data, compName)} />}
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}
      {data && (
        <>
          {/* Net income summary card */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {[
              { label: "Total Revenue",  value: data.totalRevenue,  color: "#0ea265" },
              { label: "Total Expenses", value: data.totalExpenses, color: "#dc2626" },
              { label: "Net Income",     value: data.netIncome,     color: netPositive ? "#0ea265" : "#dc2626" },
            ].map((c) => (
              <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{money(c.value)}</div>
              </div>
            ))}
          </div>

          {monthlyData.length > 1 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 20px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Monthly Trend</div>
              <PnlBarChart months={monthlyData} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <SectionCard>
              <SectionHead label="Income" color="#0ea265" />
              {data.revenue.length === 0 ? <Empty /> : data.revenue.map((r) => <LineRow key={r.accountId} code={r.code} name={r.name} value={r.amount} />)}
              <TotalRow label="Total Revenue" value={data.totalRevenue} color="#0ea265" />
            </SectionCard>

            <SectionCard>
              <SectionHead label="Expenses" color="#d97706" />
              {data.expenses.length === 0 ? <Empty /> : data.expenses.map((r) => <LineRow key={r.accountId} code={r.code} name={r.name} value={r.amount} />)}
              <TotalRow label="Total Expenses" value={data.totalExpenses} color="#d97706" />
            </SectionCard>
          </div>

          <SectionCard>
            <TotalRow label="Net Income" value={data.netIncome} highlight color={netPositive ? "#0ea265" : "#dc2626"} />
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BalanceSheetReport() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [err,  setErr]  = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    companyApi.get<BalanceSheet>(`/reports/balance-sheet?asOf=${asOf}`)
      .then(setData).catch((e) => setErr(e.message));
  }, [companyApi, asOf]);

  const balanced = data ? Math.abs(Number(data.totalAssets) - Number(data.totalLiabilitiesAndEquity)) < 0.01 : true;
  const compName = currentCompany?.name ?? "DMXI";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <ReportHeader title="Balance Sheet" subtitle={`As of ${asOf}`} />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {data && <ExportButtons onExcel={() => exportBalanceSheetExcel(data, compName)} onPdf={() => exportBalanceSheetPdf(data, compName)} />}
          <label style={{ margin: 0, fontSize: 12 }}>
            As of
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 150 }} />
          </label>
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}
      {data && (
        <>
          {/* Summary chips */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {[
              { label: "Total Assets",              value: data.totalAssets,              color: "#2454ff" },
              { label: "Total Liabilities",         value: data.totalLiabilities,         color: "#dc2626" },
              { label: "Equity + Retained Earnings",value: data.totalLiabilitiesAndEquity,color: "#7c3aed" },
            ].map((c) => (
              <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{money(c.value)}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Assets */}
            <SectionCard>
              <SectionHead label="Assets" color="#2454ff" />
              {data.assets.length === 0 ? <Empty /> : data.assets.map((r) => <LineRow key={r.accountId} code={r.code} name={r.name} value={r.balance} />)}
              <TotalRow label="Total Assets" value={data.totalAssets} color="#2454ff" />
            </SectionCard>

            {/* Liabilities + Equity */}
            <SectionCard>
              <SectionHead label="Liabilities" color="#dc2626" />
              {data.liabilities.length === 0 ? <Empty /> : data.liabilities.map((r) => <LineRow key={r.accountId} code={r.code} name={r.name} value={r.balance} />)}
              <TotalRow label="Total Liabilities" value={data.totalLiabilities} color="#dc2626" />

              <SectionHead label="Equity" color="#7c3aed" />
              {data.equity.map((r) => <LineRow key={r.accountId} code={r.code} name={r.name} value={r.balance} />)}
              <LineRow name="Retained Earnings (net income to date)" value={data.retainedEarnings} muted />
              <TotalRow label="Total Liabilities & Equity" value={data.totalLiabilitiesAndEquity} highlight color="#7c3aed" />
            </SectionCard>
          </div>

          {/* Balance check */}
          <div style={{ padding: "12px 16px", borderRadius: 10, background: balanced ? "#edfaf3" : "#fef2f2", border: `1px solid ${balanced ? "#6ee7b7" : "#fecaca"}`, fontSize: 13, fontWeight: 600, color: balanced ? "#0ea265" : "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
            {balanced ? "✓ Balance sheet is balanced — Assets = Liabilities + Equity" : "⚠ Balance sheet is out of balance — please review journal entries"}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Cash Flow ────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  REVENUE:   "Operating — Revenue",
  EXPENSE:   "Operating — Expenses",
  ASSET:     "Investing",
  LIABILITY: "Financing — Liabilities",
  EQUITY:    "Financing — Equity",
  OTHER:     "Other",
};

function CashFlowReport() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [from, setFrom] = useState(startOfYear());
  const [to,   setTo]   = useState(today());
  const [data, setData] = useState<CashFlow | null>(null);
  const [err,  setErr]  = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    companyApi.get<CashFlow>(`/reports/cash-flow?from=${from}&to=${to}`)
      .then(setData).catch((e) => setErr(e.message));
  }, [companyApi, from, to]);

  const net = data ? Number(data.netChange) : 0;
  const compName = currentCompany?.name ?? "DMXI";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <ReportHeader title="Cash Flow" subtitle={`${from} → ${to}`} />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {data && <ExportButtons onExcel={() => exportCashFlowExcel(data, compName)} onPdf={() => exportCashFlowPdf(data, compName)} />}
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}
      {data && (
        <>
          {/* Net change card */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Net Change in Cash</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: net >= 0 ? "#0ea265" : "#dc2626" }}>{net >= 0 ? "+" : ""}{money(net)}</div>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Cash Accounts</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                {data.cashAccounts.length === 0 ? "—" : data.cashAccounts.map((a) => a.name).join(", ")}
              </div>
            </div>
          </div>

          <SectionCard>
            <SectionHead label="Activity by Category" color="#2454ff" />
            {Object.entries(data.byCategory).length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>No cash activity in this period.</div>
            ) : (
              Object.entries(data.byCategory).map(([cat, amt]) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13 }}>{CATEGORY_LABEL[cat] ?? cat}</span>
                  <span style={{ fontWeight: 600, color: Number(amt) >= 0 ? "#0ea265" : "#dc2626" }}>
                    {Number(amt) >= 0 ? "+" : ""}{money(amt)}
                  </span>
                </div>
              ))
            )}
            <TotalRow label="Net Change" value={data.netChange} highlight color={net >= 0 ? "#0ea265" : "#dc2626"} />
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TrialBalanceReport() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState<TrialBalance | null>(null);
  const [err,  setErr]  = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    companyApi.get<TrialBalance>(`/reports/trial-balance?asOf=${asOf}`)
      .then(setData).catch((e) => setErr(e.message));
  }, [companyApi, asOf]);

  const diff = data ? Math.abs(Number(data.grandDebit) - Number(data.grandCredit)) : 0;
  const compName = currentCompany?.name ?? "DMXI";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <ReportHeader title="Trial Balance" subtitle={`As of ${asOf} — all accounts with activity`} />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {data && <ExportButtons onExcel={() => exportTrialBalanceExcel(data, compName)} onPdf={() => exportTrialBalancePdf(data, compName)} />}
          <label style={{ margin: 0, fontSize: 12 }}>
            As of
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 150 }} />
          </label>
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}

      {data && (
        <>
          {/* Totals summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {[
              { label: "Total Debits",  value: data.grandDebit,  color: "#2454ff" },
              { label: "Total Credits", value: data.grandCredit, color: "#7c3aed" },
              { label: "Difference",    value: String(diff),     color: diff < 0.01 ? "#0ea265" : "#dc2626" },
            ].map((c) => (
              <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{money(c.value)}</div>
                {c.label === "Difference" && <div style={{ fontSize: 11, marginTop: 4, color: c.color }}>{diff < 0.01 ? "✓ Balanced" : "⚠ Out of balance"}</div>}
              </div>
            ))}
          </div>

          {/* Balance indicator */}
          <div style={{ padding: "11px 16px", borderRadius: 10, background: data.balanced ? "#edfaf3" : "#fef2f2", border: `1px solid ${data.balanced ? "#6ee7b7" : "#fecaca"}`, fontSize: 13, fontWeight: 600, color: data.balanced ? "#0ea265" : "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
            {data.balanced
              ? `✓ All ${data.rows.length} accounts balance — Σ Debits = Σ Credits = ${money(data.grandDebit)}`
              : `⚠ Ledger is out of balance by ${money(diff)} — check for missing entries`}
          </div>

          {/* Account table */}
          <SectionCard>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "var(--bg)" }}>
                  {["Code", "Account Name", "Type", "Debit", "Credit"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: i >= 3 ? "right" : "left", borderBottom: "2px solid var(--border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No transactions recorded yet.</td></tr>
                )}
                {data.rows.map((row) => {
                  const tc = TYPE_COLOR[row.type];
                  return (
                    <tr key={row.accountId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: "var(--primary)" }}>
                        {row.code}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 500 }}>{row.name}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: tc.bg, color: tc.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {tc.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 13, fontWeight: Number(row.debit) > 0 ? 600 : 400, color: Number(row.debit) > 0 ? "#2454ff" : "var(--muted)" }}>
                        {Number(row.debit) > 0 ? money(row.debit) : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 13, fontWeight: Number(row.credit) > 0 ? 600 : 400, color: Number(row.credit) > 0 ? "#7c3aed" : "var(--muted)" }}>
                        {Number(row.credit) > 0 ? money(row.credit) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={3} style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13 }}>Grand Total</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontSize: 14, color: "#2454ff" }}>{money(data.grandDebit)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontSize: 14, color: "#7c3aed" }}>{money(data.grandCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Budget vs Actual ─────────────────────────────────────────────────────────

const BUDGET_KEY = "dmxi_budgets";
const EXPENSE_CATS = ["Salary","Rent","Utilities","Insurance","Transport","Marketing","Office Supplies","Other"];

function loadBudgets(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(BUDGET_KEY) ?? "{}"); } catch { return {}; }
}
function saveBudgets(b: Record<string, number>) {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(b));
}

function BudgetReport() {
  const companyApi = useCompanyApi();
  const [from, setFrom] = useState(startOfYear());
  const [to,   setTo]   = useState(today());
  const [pnl,  setPnl]  = useState<ProfitAndLoss | null>(null);
  const [budgets, setBudgets] = useState<Record<string, number>>(loadBudgets);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<Record<string, number>>({});
  const [err,     setErr]     = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    companyApi.get<ProfitAndLoss>(`/reports/profit-and-loss?from=${from}&to=${to}`)
      .then(setPnl).catch((e) => setErr(e.message));
  }, [companyApi, from, to]);

  function startEdit() { setDraft({ ...budgets }); setEditing(true); }
  function saveEdit() { saveBudgets(draft); setBudgets(draft); setEditing(false); }

  // Build combined rows from expense accounts + standard categories
  const rows = EXPENSE_CATS.map((cat) => {
    const actual = pnl?.expenses.find((e) => e.name.toLowerCase().includes(cat.toLowerCase()));
    const actualAmt = actual ? Number(actual.amount) : 0;
    const budget = budgets[cat] ?? 0;
    const variance = budget - actualAmt;
    const pct = budget > 0 ? (actualAmt / budget) * 100 : null;
    return { cat, budget, actual: actualAmt, variance, pct };
  });

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalBudget - totalActual;

  // Also add revenue budget
  const revActual = pnl ? Number(pnl.totalRevenue) : 0;
  const revBudget = budgets["__revenue__"] ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <ReportHeader title="Budget vs Actual" subtitle={`${from} → ${to}`} />
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" onClick={editing ? saveEdit : startEdit}
            style={editing ? { color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4", fontWeight: 700 } : {}}>
            {editing ? "Save Budgets" : "Edit Budgets"}
          </button>
          {editing && <button className="btn" onClick={() => setEditing(false)}>Cancel</button>}
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          { label: "Revenue Budget",   value: money(revBudget),      color: "#2454ff" },
          { label: "Revenue Actual",   value: money(revActual),       color: revActual >= revBudget ? "#16a34a" : "#d97706" },
          { label: "Expense Budget",   value: money(totalBudget),     color: "#dc2626" },
          { label: "Expense Actual",   value: money(totalActual),     color: totalActual <= totalBudget ? "#16a34a" : "#dc2626" },
        ].map((c) => (
          <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Revenue row */}
      <SectionCard>
        <SectionHead label="Revenue" color="#0ea265" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 130px 120px", gap: 0, padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <span>Category</span><span style={{ textAlign: "right" }}>Budget</span><span style={{ textAlign: "right" }}>Actual</span><span style={{ textAlign: "right" }}>Variance</span><span style={{ textAlign: "right" }}>Used</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 130px 120px", gap: 0, padding: "12px 20px", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Total Revenue</span>
          <span style={{ textAlign: "right", fontSize: 13 }}>
            {editing ? (
              <input type="number" min={0} value={draft["__revenue__"] ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, "__revenue__": parseFloat(e.target.value) || 0 }))}
                style={{ width: 110, textAlign: "right" }} />
            ) : money(revBudget)}
          </span>
          <span style={{ textAlign: "right", fontWeight: 600, color: "#0ea265", fontSize: 13 }}>{money(revActual)}</span>
          <span style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: revActual >= revBudget ? "#16a34a" : "#d97706" }}>
            {revActual >= revBudget ? "+" : ""}{money(revActual - revBudget)}
          </span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {revBudget > 0 && (
              <div style={{ width: 80, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min((revActual / revBudget) * 100, 100)}%`, background: revActual >= revBudget ? "#16a34a" : "#d97706", borderRadius: 3 }} />
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Expense table */}
      <SectionCard>
        <SectionHead label="Expenses" color="#dc2626" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 130px 120px", gap: 0, padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <span>Category</span><span style={{ textAlign: "right" }}>Budget</span><span style={{ textAlign: "right" }}>Actual</span><span style={{ textAlign: "right" }}>Variance</span><span style={{ textAlign: "right" }}>Used</span>
        </div>
        {rows.map((r) => (
          <div key={r.cat} style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 130px 120px", gap: 0, padding: "10px 20px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{r.cat}</span>
            <span style={{ textAlign: "right", fontSize: 13 }}>
              {editing ? (
                <input type="number" min={0} value={draft[r.cat] ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.cat]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: 110, textAlign: "right" }} />
              ) : money(r.budget)}
            </span>
            <span style={{ textAlign: "right", fontWeight: 600, color: r.actual > 0 ? "#dc2626" : "var(--muted)", fontSize: 13 }}>
              {r.actual > 0 ? money(r.actual) : "—"}
            </span>
            <span style={{ textAlign: "right", fontSize: 13, fontWeight: r.budget > 0 ? 700 : 400, color: r.budget === 0 ? "var(--muted)" : r.variance >= 0 ? "#16a34a" : "#dc2626" }}>
              {r.budget === 0 ? "—" : `${r.variance >= 0 ? "+" : ""}${money(r.variance)}`}
            </span>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
              {r.pct !== null ? (
                <>
                  <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(r.pct, 100)}%`, background: r.pct > 100 ? "#dc2626" : r.pct > 80 ? "#d97706" : "#16a34a", borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontSize: 11, color: r.pct > 100 ? "#dc2626" : r.pct > 80 ? "#d97706" : "#16a34a", fontWeight: 700, minWidth: 32 }}>{Math.round(r.pct)}%</span>
                </>
              ) : <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>}
            </div>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 130px 120px", gap: 0, padding: "12px 20px", borderTop: "2px solid var(--border)", background: "var(--bg)", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Total Expenses</span>
          <span style={{ textAlign: "right", fontWeight: 700, fontSize: 14 }}>{money(totalBudget)}</span>
          <span style={{ textAlign: "right", fontWeight: 700, fontSize: 14, color: "#dc2626" }}>{money(totalActual)}</span>
          <span style={{ textAlign: "right", fontWeight: 800, fontSize: 14, color: totalVariance >= 0 ? "#16a34a" : "#dc2626" }}>
            {totalVariance >= 0 ? "+" : ""}{money(totalVariance)}
          </span>
          <span />
        </div>
      </SectionCard>

      {!pnl && !err && <div style={{ textAlign: "center", padding: 32, color: "var(--muted)", fontSize: 13 }}>Loading actuals…</div>}
    </div>
  );
}

// ─── Stock Report ─────────────────────────────────────────────────────────────

interface StockRow {
  id: string; name: string; description: string | null; unit: string | null;
  unitPrice: number; openingStock: number; totalPurchased: number;
  available: number; reorderLevel: number; stockValue: number; isActive: boolean;
}

function stockStatus(r: StockRow): "out" | "low" | "ok" {
  if (r.available <= 0) return "out";
  if (r.reorderLevel > 0 && r.available <= r.reorderLevel) return "low";
  return "ok";
}

const ST_CFG = {
  out: { label: "Out of Stock", bg: "#fef2f2", color: "#dc2626" },
  low: { label: "Low Stock",    bg: "#fffbeb", color: "#d97706" },
  ok:  { label: "In Stock",     bg: "#f0fdf4", color: "#16a34a" },
};

function StockReport() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    companyApi.get<StockRow[]>("/stock-report")
      .then(setRows).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [companyApi]);

  const filtered = rows.filter((r) =>
    !search.trim() || r.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalValue = rows.reduce((s, r) => s + r.stockValue, 0);
  const outCount = rows.filter((r) => stockStatus(r) === "out").length;
  const lowCount = rows.filter((r) => stockStatus(r) === "low").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <ReportHeader title="Stock Report" subtitle="Current inventory levels across all products" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Search product…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220, fontSize: 13 }} />
          {rows.length > 0 && (
            <button
              className="btn"
              onClick={() => exportStockReportExcel(rows, currentCompany?.name ?? "")}
              style={{ fontSize: 12, padding: "6px 13px", display: "flex", alignItems: "center", gap: 5, color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4" }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/>
              </svg>
              Excel
            </button>
          )}
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {[
          { label: "Total Stock Value", value: money(totalValue),       color: "#2454ff" },
          { label: "Total Products",    value: String(rows.length),     color: "#0ea265" },
          { label: "Low Stock",         value: String(lowCount),        color: "#d97706" },
          { label: "Out of Stock",      value: String(outCount),        color: "#dc2626" },
        ].map((c) => (
          <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <SectionCard>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
              {["Product", "Unit", "Opening", "Purchased", "Available", "Reorder Level", "Unit Price", "Stock Value", "Status"].map((h, i) => (
                <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: i > 1 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                {rows.length === 0 ? "No products yet — add them from the Products page." : "No products match the search."}
              </td></tr>
            )}
            {filtered.map((r) => {
              const st = stockStatus(r);
              const cfg = ST_CFG[st];
              const pct = r.reorderLevel > 0 ? Math.min((r.available / (r.reorderLevel * 2)) * 100, 100) : r.available > 0 ? 100 : 0;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", opacity: r.isActive ? 1 : 0.5 }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    {r.description && <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.description}</div>}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 13 }}>{r.unit ?? "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--muted)", fontSize: 13 }}>{r.openingStock}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "#2454ff", fontWeight: 600, fontSize: 13 }}>+{r.totalPurchased}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: st === "out" ? "#dc2626" : st === "low" ? "#d97706" : "var(--text)" }}>{r.available}</div>
                    <div style={{ width: 70, height: 4, borderRadius: 2, background: "var(--border)", marginTop: 4, marginLeft: "auto" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: st === "out" ? "#dc2626" : st === "low" ? "#d97706" : "#16a34a" }} />
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--muted)", fontSize: 13 }}>{r.reorderLevel > 0 ? r.reorderLevel : "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13 }}>{money(r.unitPrice)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>{money(r.stockValue)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                <td colSpan={7} style={{ padding: "10px 14px", fontWeight: 700 }}>Total Inventory Value</td>
                <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800, fontSize: 16, color: "#2454ff" }}>{money(filtered.reduce((s, r) => s + r.stockValue, 0))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </SectionCard>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("pnl");

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 6, width: "fit-content" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
              background: tab === t.key ? "var(--primary)" : "transparent",
              color: tab === t.key ? "#fff" : "var(--muted)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Svg d={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pnl"      && <PnlReport />}
      {tab === "balance"  && <BalanceSheetReport />}
      {tab === "cashflow" && <CashFlowReport />}
      {tab === "trial"    && <TrialBalanceReport />}
      {tab === "budget"   && <BudgetReport />}
      {tab === "stock"    && <StockReport />}
    </div>
  );
}
