import { useState, useMemo } from "react";
import { money } from "../lib/format";

type TxnStatus = "UNMATCHED" | "MATCHED" | "EXCLUDED";
type EntryStatus = "UNMATCHED" | "MATCHED";

interface BankTxn {
  id: string;
  date: string;
  description: string;
  amount: number; // positive = credit, negative = debit
  status: TxnStatus;
  matchedEntryId?: string;
}

interface LedgerEntry {
  id: string;
  date: string;
  memo: string;
  ref: string;
  amount: number;
  status: EntryStatus;
  matchedTxnId?: string;
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function amtColor(n: number) { return n >= 0 ? "#16a34a" : "#dc2626"; }
function amtSign(n: number) { return n >= 0 ? "+" : ""; }

function MatchBadge({ status }: { status: TxnStatus | EntryStatus }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    MATCHED:   { bg: "#f0fdf4", color: "#16a34a", label: "Matched" },
    UNMATCHED: { bg: "#fffbeb", color: "#d97706", label: "Unmatched" },
    EXCLUDED:  { bg: "#f1f5f9", color: "#94a3b8", label: "Excluded" },
  };
  const c = cfg[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", background: c.bg, color: c.color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color }} />
      {c.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ViewTab = "overview" | "bank" | "ledger" | "matched";

export default function ReconciliationPage() {
  const [bankTxns, setBankTxns]       = useState<BankTxn[]>([]);
  const [ledgerEntries, setLedger]    = useState<LedgerEntry[]>([]);
  const [tab, setTab]                 = useState<ViewTab>("overview");
  const [selectedBank, setSelBank]    = useState<string | null>(null);
  const [selectedLedger, setSelLed]   = useState<string | null>(null);
  const [matchErr, setMatchErr]       = useState<string | null>(null);

  // Stats
  const bankCredits  = bankTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const bankDebits   = bankTxns.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const matched      = bankTxns.filter((t) => t.status === "MATCHED").length;
  const unmatched    = bankTxns.filter((t) => t.status === "UNMATCHED").length;
  const matchRate    = bankTxns.length ? Math.round((matched / bankTxns.length) * 100) : 0;

  // Suggested auto-match: unmatched bank txn ↔ unmatched ledger entry with same absolute amount
  const suggestions = useMemo(() => {
    const unBank  = bankTxns.filter((t) => t.status === "UNMATCHED");
    const unLedger = ledgerEntries.filter((e) => e.status === "UNMATCHED");
    return unBank.flatMap((bt) => {
      const match = unLedger.find((le) => Math.abs(le.amount - Math.abs(bt.amount)) < 0.01);
      return match ? [{ bankId: bt.id, entryId: match.id, amount: Math.abs(bt.amount) }] : [];
    });
  }, [bankTxns, ledgerEntries]);

  function handleMatch() {
    if (!selectedBank || !selectedLedger) return;
    const bt = bankTxns.find((t) => t.id === selectedBank);
    const le = ledgerEntries.find((e) => e.id === selectedLedger);
    if (!bt || !le) return;
    if (Math.abs(Math.abs(bt.amount) - le.amount) > 0.01) {
      setMatchErr(`Amount mismatch: bank ${money(Math.abs(bt.amount))} ≠ ledger ${money(le.amount)}`);
      return;
    }
    setMatchErr(null);
    setBankTxns((prev) => prev.map((t) => t.id === selectedBank ? { ...t, status: "MATCHED", matchedEntryId: selectedLedger } : t));
    setLedger((prev) => prev.map((e) => e.id === selectedLedger ? { ...e, status: "MATCHED", matchedTxnId: selectedBank } : e));
    setSelBank(null); setSelLed(null);
  }

  function handleAutoMatch(bankId: string, entryId: string) {
    setBankTxns((prev) => prev.map((t) => t.id === bankId ? { ...t, status: "MATCHED", matchedEntryId: entryId } : t));
    setLedger((prev) => prev.map((e) => e.id === entryId ? { ...e, status: "MATCHED", matchedTxnId: bankId } : e));
  }

  function handleExclude(bankId: string) {
    setBankTxns((prev) => prev.map((t) => t.id === bankId ? { ...t, status: "EXCLUDED" } : t));
  }

  function handleUnmatch(bankId: string) {
    const bt = bankTxns.find((t) => t.id === bankId);
    if (!bt?.matchedEntryId) return;
    setBankTxns((prev) => prev.map((t) => t.id === bankId ? { ...t, status: "UNMATCHED", matchedEntryId: undefined } : t));
    setLedger((prev) => prev.map((e) => e.id === bt.matchedEntryId ? { ...e, status: "UNMATCHED", matchedTxnId: undefined } : e));
  }

  const TABS: { key: ViewTab; label: string; icon: string }[] = [
    { key: "overview", label: "Overview",    icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" },
    { key: "bank",     label: "Bank Feed",   icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
    { key: "ledger",   label: "Ledger",      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    { key: "matched",  label: "Matched",     icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  return (
    <div>
      {/* ── Hero header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
        borderRadius: 16, padding: "28px 32px", marginBottom: 24, color: "#fff",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", bottom: -20, left: 200, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />

        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "7px 8px", display: "flex" }}>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                </div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Reconciliation Engine</h1>
              </div>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                Match bank transactions against your ledger entries to keep books accurate.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12 }}>
                Import Bank CSV
              </button>
              <button className="btn" style={{ background: "#fff", color: "#1e3a4a", border: "none", fontWeight: 700, fontSize: 12 }}>
                Auto-Match All
              </button>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {[
              { label: "Credits",      value: money(bankCredits),   color: "#4ade80", icon: "M7 11l5-5m0 0l5 5m-5-5v12" },
              { label: "Debits",       value: money(bankDebits),    color: "#f87171", icon: "M17 13l-5 5m0 0l-5-5m5 5V6" },
              { label: "Matched",      value: String(matched),      color: "#4ade80", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
              { label: "Unmatched",    value: String(unmatched),    color: "#fbbf24", icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
              { label: "Match Rate",   value: `${matchRate}%`,      color: matchRate >= 80 ? "#4ade80" : "#fbbf24", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
            ].map((c) => (
              <div key={c.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d={c.icon} />
                  </svg>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65 }}>{c.label}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Coming soon banner ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderLeft: "4px solid #f59e0b", borderRadius: 10,
        padding: "14px 20px", marginBottom: 20,
      }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>Coming Soon</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            The Reconciliation Engine is under development. Bank import, auto-matching, and full ledger sync will be available in a future release.
          </div>
        </div>
        <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: "#fffbeb", color: "#d97706", padding: "4px 10px", borderRadius: 20 }}>
          In Development
        </span>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 5, width: "fit-content" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
              borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: tab === t.key ? "var(--primary, #2454ff)" : "transparent",
              color: tab === t.key ? "#fff" : "var(--muted)",
              transition: "background 0.15s, color 0.15s",
            }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW tab ── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Manual match panel */}
          {(selectedBank || selectedLedger) && (
            <div style={{ background: "var(--surface)", border: "2px solid var(--primary, #2454ff)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "var(--primary, #2454ff)", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                Manual Match
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
                <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 14px", fontSize: 13, minHeight: 48, display: "flex", alignItems: "center" }}>
                  {selectedBank ? (() => { const t = bankTxns.find((x) => x.id === selectedBank)!; return <><span style={{ fontWeight: 600 }}>{t.description}</span><span style={{ color: amtColor(t.amount), fontWeight: 700, marginLeft: 8 }}>{amtSign(t.amount)}{money(Math.abs(t.amount))}</span></>; })() : <span style={{ color: "var(--muted)" }}>Select a bank transaction →</span>}
                </div>
                <div style={{ textAlign: "center", color: "var(--muted)" }}>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4"/></svg>
                </div>
                <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 14px", fontSize: 13, minHeight: 48, display: "flex", alignItems: "center" }}>
                  {selectedLedger ? (() => { const e = ledgerEntries.find((x) => x.id === selectedLedger)!; return <><span style={{ fontWeight: 600 }}>{e.memo}</span><span style={{ color: "#2454ff", fontWeight: 700, marginLeft: 8 }}>{money(e.amount)}</span></>; })() : <span style={{ color: "var(--muted)" }}>← Select a ledger entry</span>}
                </div>
              </div>
              {matchErr && <div className="error-text" style={{ marginTop: 10 }}>{matchErr}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" onClick={handleMatch} disabled={!selectedBank || !selectedLedger}>Match</button>
                <button className="btn" onClick={() => { setSelBank(null); setSelLed(null); setMatchErr(null); }}>Clear</button>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ background: "#fffbeb", borderRadius: 8, padding: "5px 7px", display: "flex" }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Suggested Matches</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{suggestions.length} possible match{suggestions.length !== 1 ? "es" : ""} found</span>
              </div>
              {suggestions.map((s) => {
                const bt = bankTxns.find((t) => t.id === s.bankId)!;
                const le = ledgerEntries.find((e) => e.id === s.entryId)!;
                return (
                  <div key={s.bankId + s.entryId} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 16, padding: "12px 20px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{bt.description}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{fmt(bt.date)}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontWeight: 800, color: "#d97706", fontSize: 14 }}>{money(s.amount)}</span>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4"/></svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{le.memo}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{le.ref} · {fmt(le.date)}</div>
                    </div>
                    <button className="btn" onClick={() => handleAutoMatch(s.bankId, s.entryId)}
                      style={{ fontSize: 12, padding: "5px 14px", color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4", fontWeight: 700 }}>
                      Match
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Two-column: unmatched bank + unmatched ledger */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Unmatched bank txns */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>Unmatched Bank Transactions</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#d97706", background: "#fffbeb", padding: "2px 8px", borderRadius: 12 }}>
                  {bankTxns.filter((t) => t.status === "UNMATCHED").length}
                </span>
              </div>
              {bankTxns.filter((t) => t.status === "UNMATCHED").map((t) => (
                <div key={t.id}
                  onClick={() => setSelBank(t.id === selectedBank ? null : t.id)}
                  style={{
                    padding: "12px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer",
                    background: selectedBank === t.id ? "var(--primary, #2454ff)18" : "transparent",
                    borderLeft: selectedBank === t.id ? "3px solid var(--primary, #2454ff)" : "3px solid transparent",
                    transition: "background 0.1s",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{fmt(t.date)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: amtColor(t.amount) }}>
                        {amtSign(t.amount)}{money(Math.abs(t.amount))}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); handleExclude(t.id); }}
                        title="Exclude transaction" style={{ padding: "2px 7px", fontSize: 11, border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", background: "transparent", color: "var(--muted)" }}>
                        Skip
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {bankTxns.filter((t) => t.status === "UNMATCHED").length === 0 && (
                <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>All bank transactions matched</div>
              )}
            </div>

            {/* Unmatched ledger entries */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>Unmatched Ledger Entries</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#d97706", background: "#fffbeb", padding: "2px 8px", borderRadius: 12 }}>
                  {ledgerEntries.filter((e) => e.status === "UNMATCHED").length}
                </span>
              </div>
              {ledgerEntries.filter((e) => e.status === "UNMATCHED").map((e) => (
                <div key={e.id}
                  onClick={() => setSelLed(e.id === selectedLedger ? null : e.id)}
                  style={{
                    padding: "12px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer",
                    background: selectedLedger === e.id ? "var(--primary, #2454ff)18" : "transparent",
                    borderLeft: selectedLedger === e.id ? "3px solid var(--primary, #2454ff)" : "3px solid transparent",
                    transition: "background 0.1s",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.memo}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{e.ref} · {fmt(e.date)}</div>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#2454ff", flexShrink: 0 }}>{money(e.amount)}</span>
                  </div>
                </div>
              ))}
              {ledgerEntries.filter((e) => e.status === "UNMATCHED").length === 0 && (
                <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>All ledger entries matched</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BANK FEED tab ── */}
      {tab === "bank" && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Date</th>
                <th>Description</th>
                <th style={{ width: 130, textAlign: "right" }}>Amount</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {bankTxns.map((t) => (
                <tr key={t.id} style={{ opacity: t.status === "EXCLUDED" ? 0.45 : 1 }}>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmt(t.date)}</td>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{t.description}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: amtColor(t.amount) }}>
                    {amtSign(t.amount)}{money(Math.abs(t.amount))}
                  </td>
                  <td><MatchBadge status={t.status} /></td>
                  <td style={{ textAlign: "right" }}>
                    {t.status === "MATCHED" && (
                      <button className="btn" onClick={() => handleUnmatch(t.id)}
                        style={{ fontSize: 11, padding: "3px 9px", color: "#dc2626", borderColor: "#fecaca" }}>
                        Unmatch
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LEDGER tab ── */}
      {tab === "ledger" && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Date</th>
                <th>Memo</th>
                <th style={{ width: 130 }}>Reference</th>
                <th style={{ width: 130, textAlign: "right" }}>Amount</th>
                <th style={{ width: 110 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmt(e.date)}</td>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{e.memo}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--primary, #2454ff)", fontWeight: 700 }}>{e.ref}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{money(e.amount)}</td>
                  <td><MatchBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MATCHED tab ── */}
      {tab === "matched" && (
        <div className="card" style={{ padding: 0 }}>
          {bankTxns.filter((t) => t.status === "MATCHED").length === 0 ? (
            <div style={{ padding: "48px 32px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No matched transactions yet. Use the Overview tab to match entries.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Date</th>
                  <th>Bank Transaction</th>
                  <th style={{ width: 130, textAlign: "right" }}>Amount</th>
                  <th>Ledger Entry</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {bankTxns.filter((t) => t.status === "MATCHED").map((t) => {
                  const le = ledgerEntries.find((e) => e.id === t.matchedEntryId);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmt(t.date)}</td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{t.description}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: amtColor(t.amount) }}>
                        {amtSign(t.amount)}{money(Math.abs(t.amount))}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {le ? <><span style={{ fontWeight: 500 }}>{le.memo}</span> <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--primary, #2454ff)", marginLeft: 6 }}>{le.ref}</span></> : "—"}
                      </td>
                      <td>
                        <button className="btn" onClick={() => handleUnmatch(t.id)}
                          style={{ fontSize: 11, padding: "3px 9px", color: "#dc2626", borderColor: "#fecaca" }}>
                          Undo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={2} style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13 }}>
                    {bankTxns.filter((t) => t.status === "MATCHED").length} matched pair{bankTxns.filter((t) => t.status === "MATCHED").length !== 1 ? "s" : ""}
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>
                    {money(bankTxns.filter((t) => t.status === "MATCHED").reduce((s, t) => s + Math.abs(t.amount), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
