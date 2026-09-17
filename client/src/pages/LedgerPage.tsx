import { useEffect, useState, type FormEvent } from "react";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { Account, AccountType, JournalEntry, LedgerRow } from "../api/types";
import { ApiError } from "../api/client";
import Modal from "../components/Modal";
import { money, dateOnly } from "../lib/format";
import { exportDaybook, exportAccountLedger, exportChartOfAccounts } from "../lib/exportExcel";

const ACCOUNT_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

const TYPE_COLOR: Record<AccountType, string> = {
  ASSET:     "#2454ff",
  LIABILITY: "#dc2626",
  EQUITY:    "#7c3aed",
  REVENUE:   "#16a34a",
  EXPENSE:   "#d97706",
};

type Tab = "daybook" | "ledger" | "accounts";

function firstOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function LedgerPage() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const isOwner = currentCompany?.role === "OWNER";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("daybook");
  const [fromDate, setFromDate] = useState(firstOfYear);
  const [toDate, setToDate] = useState(today);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);

  function load() {
    Promise.all([
      companyApi.get<Account[]>("/accounts"),
      companyApi.get<JournalEntry[]>("/journal-entries"),
    ])
      .then(([acc, je]) => { setAccounts(acc); setEntries(je); })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [companyApi]);

  return (
    <div>
      <div className="page-header">
        <h1>Ledger</h1>
        <div style={{ display: "flex", gap: 10 }}>
          {isOwner && <button className="btn" onClick={() => setShowAccountModal(true)}>+ Account</button>}
          <button className="btn btn-primary" onClick={() => setShowEntryModal(true)} disabled={accounts.length < 2}>
            + Journal Entry
          </button>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* Date range — hidden on Chart of Accounts tab */}
      {tab !== "accounts" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
            padding: "12px 16px",
            background: "var(--bg-alt, #f9fafb)",
            borderRadius: 8,
            border: "1px solid var(--border, #e5e7eb)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>
            Date Range
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ width: 140 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ width: 140 }}
            />
          </label>
          <button
            className="btn"
            style={{ fontSize: 12 }}
            onClick={() => { setFromDate(firstOfYear()); setToDate(today()); }}
          >
            Reset
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid var(--border, #e5e7eb)" }}>
        {(["daybook", "ledger", "accounts"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              padding: "9px 20px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: tab === t ? "var(--primary, #2454ff)" : "var(--muted, #6b7280)",
              borderBottom: tab === t ? "2px solid var(--primary, #2454ff)" : "2px solid transparent",
              marginBottom: -2,
              whiteSpace: "nowrap",
            }}
          >
            {t === "daybook" ? "Journal Daybook" : t === "ledger" ? "Account Ledger" : "Chart of Accounts"}
          </button>
        ))}
      </div>

      {tab === "daybook"  && (
        <DaybookView
          entries={entries}
          fromDate={fromDate}
          toDate={toDate}
        />
      )}
      {tab === "ledger" && (
        <AccountLedgerView
          accounts={accounts}
          fromDate={fromDate}
          toDate={toDate}
        />
      )}
      {tab === "accounts" && (
        <ChartOfAccountsView accounts={accounts} companyName={currentCompany?.name ?? ""} />
      )}

      {showAccountModal && (
        <NewAccountModal
          onClose={() => setShowAccountModal(false)}
          onCreated={() => { setShowAccountModal(false); load(); }}
        />
      )}
      {showEntryModal && (
        <NewJournalEntryModal
          accounts={accounts}
          onClose={() => setShowEntryModal(false)}
          onCreated={() => { setShowEntryModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Journal Daybook ──────────────────────────────────────────────────────────

function DaybookView({
  entries,
  fromDate,
  toDate,
}: {
  entries: JournalEntry[];
  fromDate: string;
  toDate: string;
}) {
  const { currentCompany } = useAuth();
  const filtered = entries.filter((e) => {
    const d = e.date.slice(0, 10);
    return d >= fromDate && d <= toDate;
  });

  const totalDr = filtered.reduce((s, e) => s + e.lines.reduce((ls, l) => ls + Number(l.debit), 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · Total: {money(totalDr)}
        </span>
        <button
          className="btn"
          disabled={filtered.length === 0}
          onClick={() => void exportDaybook(filtered, { from: fromDate, to: toDate }, currentCompany?.name ?? "")}
        >
          ↓ Export to Excel
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
          No journal entries in this date range.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Date</th>
                <th>Particulars</th>
                <th style={{ width: 160 }}>Reference</th>
                <th style={{ width: 140, textAlign: "right" }}>Debit (Dr)</th>
                <th style={{ width: 140, textAlign: "right" }}>Credit (Cr)</th>
              </tr>
            </thead>
            {filtered.map((entry) => {
              const drLines = entry.lines.filter((l) => Number(l.debit)  > 0);
              const crLines = entry.lines.filter((l) => Number(l.credit) > 0);
              const totalEntry = drLines.reduce((s, l) => s + Number(l.debit), 0);

              return (
                <tbody key={entry.id} style={{ borderTop: "2px solid var(--border, #e5e7eb)" }}>
                  {/* Debit lines */}
                  {drLines.map((l, i) => (
                    <tr key={`dr-${l.id ?? i}`}>
                      {i === 0 && (
                        <td
                          rowSpan={drLines.length + crLines.length + 1}
                          style={{ verticalAlign: "top", paddingTop: 10, color: "var(--muted)", fontSize: 13, whiteSpace: "nowrap" }}
                        >
                          {dateOnly(entry.date)}
                        </td>
                      )}
                      <td style={{ paddingLeft: 8, fontWeight: 500 }}>
                        <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>Dr</span>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted)", marginRight: 6 }}>
                          {l.account?.code}
                        </span>
                        {l.account?.name ?? l.accountId}
                        {l.description && (
                          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{l.description}</span>
                        )}
                      </td>
                      {i === 0 && (
                        <td
                          rowSpan={drLines.length}
                          style={{ verticalAlign: "top", paddingTop: 10, color: "var(--muted)", fontSize: 12 }}
                        >
                          {entry.reference ?? "—"}
                        </td>
                      )}
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{money(l.debit)}</td>
                      <td></td>
                    </tr>
                  ))}

                  {/* Credit lines */}
                  {crLines.map((l, i) => (
                    <tr key={`cr-${l.id ?? i}`}>
                      {drLines.length === 0 && i === 0 && (
                        <td
                          rowSpan={crLines.length + 1}
                          style={{ verticalAlign: "top", paddingTop: 10, color: "var(--muted)", fontSize: 13 }}
                        >
                          {dateOnly(entry.date)}
                        </td>
                      )}
                      {drLines.length === 0 && i === 0 && (
                        <td
                          rowSpan={crLines.length}
                          style={{ verticalAlign: "top", paddingTop: 10, color: "var(--muted)", fontSize: 12 }}
                        >
                          {entry.reference ?? "—"}
                        </td>
                      )}
                      <td style={{ paddingLeft: 36, color: "var(--muted)" }}>
                        <span style={{ fontSize: 11, marginRight: 4 }}>Cr</span>
                        <span style={{ fontFamily: "monospace", fontSize: 12, marginRight: 6 }}>{l.account?.code}</span>
                        {l.account?.name ?? l.accountId}
                        {l.description && (
                          <span style={{ fontSize: 12, marginLeft: 8 }}>{l.description}</span>
                        )}
                      </td>
                      <td></td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{money(l.credit)}</td>
                    </tr>
                  ))}

                  {/* Narration row */}
                  <tr>
                    <td
                      colSpan={drLines.length > 0 ? 1 : 2}
                      style={{ paddingLeft: 8, paddingBottom: 10, fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}
                    >
                      ({entry.memo ?? "No narration"})
                    </td>
                    {drLines.length > 0 && <td></td>}
                    <td style={{ textAlign: "right", fontSize: 12, color: "var(--muted)", paddingBottom: 10 }}>
                      {money(totalEntry)}
                    </td>
                    <td style={{ textAlign: "right", fontSize: 12, color: "var(--muted)", paddingBottom: 10 }}>
                      {money(totalEntry)}
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Account Ledger ───────────────────────────────────────────────────────────

function AccountLedgerView({
  accounts,
  fromDate,
  toDate,
}: {
  accounts: Account[];
  fromDate: string;
  toDate: string;
}) {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [selectedId, setSelectedId] = useState("");
  const [allRows, setAllRows] = useState<LedgerRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) { setAllRows(null); return; }
    setLoading(true);
    setError(null);
    companyApi
      .get<{ lines: LedgerRow[]; endingBalance: string }>(`/accounts/${selectedId}/ledger`)
      .then((data) => setAllRows(data.lines))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedId, companyApi]);

  // Split into prior (for opening balance) and period rows
  const priorRows  = allRows?.filter((r) => r.date.slice(0, 10) <  fromDate) ?? [];
  const periodRows = allRows?.filter((r) => {
    const d = r.date.slice(0, 10);
    return d >= fromDate && d <= toDate;
  }) ?? [];

  const openingBalance = priorRows.length > 0 ? Number(priorRows[priorRows.length - 1].balance) : 0;
  const closingBalance = periodRows.length > 0 ? Number(periodRows[periodRows.length - 1].balance) : openingBalance;

  const isDebitNormal = selectedAccount?.type === "ASSET" || selectedAccount?.type === "EXPENSE";
  const drCr = (bal: number) =>
    isDebitNormal ? (bal >= 0 ? "Dr" : "Cr") : (bal >= 0 ? "Cr" : "Dr");

  return (
    <div>
      <div style={{ marginBottom: 20, maxWidth: 400 }}>
        <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Select account</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ width: "100%" }}>
          <option value="">— choose an account —</option>
          {ACCOUNT_TYPES.map((type) => {
            const group = accounts.filter((a) => a.type === type);
            if (!group.length) return null;
            return (
              <optgroup key={type} label={type}>
                {group.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {selectedAccount && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 17 }}>{selectedAccount.code}</span>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{selectedAccount.name}</span>
            <span
              style={{
                background: TYPE_COLOR[selectedAccount.type] + "22",
                color: TYPE_COLOR[selectedAccount.type],
                borderRadius: 4, padding: "2px 10px", fontSize: 12, fontWeight: 600,
              }}
            >
              {selectedAccount.type}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              Normal: {isDebitNormal ? "Debit" : "Credit"}
            </span>
          </div>
          <button
            className="btn"
            disabled={!allRows}
            onClick={() =>
              void exportAccountLedger(selectedAccount, periodRows, openingBalance, { from: fromDate, to: toDate }, currentCompany?.name ?? "")
            }
          >
            ↓ Export to Excel
          </button>
        </div>
      )}

      {error  && <div className="error-text">{error}</div>}
      {loading && <div className="muted">Loading…</div>}

      {allRows && selectedAccount && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Date</th>
                <th style={{ width: 160 }}>Reference</th>
                <th>Description</th>
                <th style={{ textAlign: "right", width: 130 }}>Debit (Dr)</th>
                <th style={{ textAlign: "right", width: 130 }}>Credit (Cr)</th>
                <th style={{ textAlign: "right", width: 130 }}>Balance</th>
                <th style={{ width: 36, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance */}
              <tr style={{ background: "var(--bg-alt, #f9fafb)", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                <td className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>—</td>
                <td></td>
                <td style={{ fontStyle: "italic", fontSize: 13, fontWeight: 600 }}>Opening Balance</td>
                <td></td>
                <td></td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{money(Math.abs(openingBalance))}</td>
                <td style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: TYPE_COLOR[selectedAccount.type] }}>
                  {drCr(openingBalance)}
                </td>
              </tr>

              {periodRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>
                    No transactions in this date range.
                  </td>
                </tr>
              )}

              {periodRows.map((r) => {
                const bal = Number(r.balance);
                const side = drCr(bal);
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 13 }}>{dateOnly(r.date)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>
                      {r.reference ?? "—"}
                    </td>
                    <td>{r.description ?? r.memo ?? "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: Number(r.debit)  > 0 ? 600 : undefined }}>
                      {Number(r.debit)  > 0 ? money(r.debit)  : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: Number(r.credit) > 0 ? 600 : undefined }}>
                      {Number(r.credit) > 0 ? money(r.credit) : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{money(Math.abs(bal))}</td>
                    <td
                      style={{
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: side === "Dr" ? TYPE_COLOR["ASSET"] : TYPE_COLOR["LIABILITY"],
                      }}
                    >
                      {side}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {periodRows.length > 0 && (
              <tfoot>
                <tr style={{ background: "var(--bg-alt, #f9fafb)", borderTop: "2px solid var(--border, #e5e7eb)" }}>
                  <td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>Closing Balance</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 15 }}>
                    {money(Math.abs(closingBalance))}
                  </td>
                  <td
                    style={{
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: drCr(closingBalance) === "Dr" ? TYPE_COLOR["ASSET"] : TYPE_COLOR["LIABILITY"],
                    }}
                  >
                    {drCr(closingBalance)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!selectedId && (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
          Select an account above to view its running ledger.
        </div>
      )}
    </div>
  );
}

// ─── Chart of Accounts ────────────────────────────────────────────────────────

function ChartOfAccountsView({ accounts, companyName }: { accounts: Account[]; companyName: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button
          className="btn"
          disabled={accounts.length === 0}
          onClick={() => void exportChartOfAccounts(accounts, companyName)}
        >
          ↓ Export to Excel
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {ACCOUNT_TYPES.map((type) => {
          const group = accounts.filter((a) => a.type === type);
          if (!group.length) return null;
          return (
            <div key={type}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 4, height: 18, borderRadius: 2, background: TYPE_COLOR[type], display: "inline-block" }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: TYPE_COLOR[type], textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {type}S
                </span>
                <span className="muted" style={{ fontSize: 12 }}>({group.length})</span>
              </div>
              <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>Code</th>
                      <th>Account Name</th>
                      <th style={{ width: 120 }}>Type</th>
                      <th style={{ width: 140 }}>Normal Balance</th>
                      <th style={{ width: 100 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: TYPE_COLOR[type] }}>
                            {a.code}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{a.name}</td>
                        <td>
                          <span style={{ background: TYPE_COLOR[type] + "18", color: TYPE_COLOR[type], borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                            {type}
                          </span>
                        </td>
                        <td className="muted" style={{ fontSize: 13 }}>
                          {type === "ASSET" || type === "EXPENSE" ? "Debit" : "Credit"}
                        </td>
                        <td>
                          <span className={`badge ${a.isActive ? "badge-green" : "badge-gray"}`}>
                            {a.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
            No accounts yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function NewAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const companyApi = useCompanyApi();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("ASSET");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await companyApi.post("/accounts", { code, name, type });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Account" onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Account Code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1300" required />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label>
          Account Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prepaid Insurance" required />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create Account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

function emptyLine(accountId: string): DraftLine {
  return { accountId, debit: "", credit: "", description: "" };
}

function NewJournalEntryModal({
  accounts, onClose, onCreated,
}: {
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const companyApi = useCompanyApi();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    emptyLine(accounts[0]?.id ?? ""),
    emptyLine(accounts[1]?.id ?? ""),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.0001 && totalDebit > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!balanced) { setError("Total debits must equal total credits"); return; }
    setError(null);
    setSubmitting(true);
    try {
      await companyApi.post("/journal-entries", {
        date,
        memo:      memo || undefined,
        reference: reference || undefined,
        lines: lines
          .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({
            accountId:   l.accountId,
            debit:       Number(l.debit  || 0),
            credit:      Number(l.credit || 0),
            description: l.description || undefined,
          })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post entry");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Journal Entry" onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Reference
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="JV-001" />
          </label>
        </div>
        <label>
          Narration / Memo
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Description of this entry" />
        </label>

        <div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 6, marginBottom: 6 }}>
            {["Account", "Debit", "Credit", "Description", ""].map((h, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{h}</span>
            ))}
          </div>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 6, marginBottom: 6 }}>
              <select value={line.accountId} onChange={(e) => updateLine(idx, { accountId: e.target.value })}>
                <option value="">—</option>
                {ACCOUNT_TYPES.map((type) => {
                  const group = accounts.filter((a) => a.type === type);
                  if (!group.length) return null;
                  return (
                    <optgroup key={type} label={type}>
                      {group.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={line.debit}
                onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
              />
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={line.credit}
                onChange={(e) => updateLine(idx, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
              />
              <input
                placeholder="Description"
                value={line.description}
                onChange={(e) => updateLine(idx, { description: e.target.value })}
              />
              <button
                type="button" className="btn"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                disabled={lines.length <= 2}
              >✕</button>
            </div>
          ))}
          <button
            type="button" className="btn" style={{ marginTop: 4 }}
            onClick={() => setLines((prev) => [...prev, emptyLine(accounts[0]?.id ?? "")])}
          >
            + Add line
          </button>
        </div>

        <div
          style={{
            display: "flex", justifyContent: "flex-end", gap: 24,
            padding: "8px 12px", borderRadius: 6,
            background: balanced ? "var(--bg-alt, #f9fafb)" : "#fef2f2",
            fontSize: 13, fontWeight: 600,
          }}
        >
          <span>Dr: {money(totalDebit)}</span>
          <span>Cr: {money(totalCredit)}</span>
          {!balanced && totalDebit > 0 && (
            <span style={{ color: "#ef4444" }}>Diff: {money(Math.abs(totalDebit - totalCredit))}</span>
          )}
          {balanced && <span style={{ color: "#16a34a" }}>✓ Balanced</span>}
        </div>

        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !balanced}>
            {submitting ? "Posting…" : "Post Entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
