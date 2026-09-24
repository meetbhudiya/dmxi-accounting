import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";

const API = (companyId: string) => `/api/companies/${companyId}`;
const tok = () => localStorage.getItem("dmxi_token") ?? "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string | null) {
  if (!s) return "Never";
  return new Date(s).toLocaleString();
}

interface BranchRow {
  id: string;
  name: string;
  url: string;
  lastSyncAt: string | null;
  createdAt: string;
}

interface SnapshotCompany {
  id: string;
  name: string;
  invoices: any[];
  expenses: any[];
  customers: any[];
}

interface Snapshot {
  branchName: string;
  exportedAt: string | null;
  companies: SnapshotCompany[];
}

export default function BranchesPage() {
  const { currentCompany } = useAuth();
  const cid = currentCompany?.id ?? "";

  // ── Branch identity (this instance) ─────────────────────────────────────
  const [myInfo, setMyInfo] = useState<{ branchId: string; branchName: string } | null>(null);
  const [myUrl, setMyUrl] = useState(window.location.origin);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    fetch("/api/branch/info").then(r => r.json()).then(setMyInfo).catch(() => {});
  }, []);

  async function saveMyName() {
    if (!editingName.trim()) return;
    setSavingName(true);
    try {
      const r = await fetch("/api/branch/config", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ branchName: editingName.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        setMyInfo(prev => prev ? { ...prev, branchName: d.branchName } : null);
        setEditingName("");
      }
    } finally { setSavingName(false); }
  }

  // ── Connected branches ───────────────────────────────────────────────────
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBranches = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    const r = await fetch(`${API(cid)}/branches`, { headers: headers() });
    if (r.ok) setBranches(await r.json());
    setLoading(false);
  }, [cid]);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  // ── Add branch modal ─────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", secretKey: "" });
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  async function testConnection() {
    if (!form.url) return;
    setTestStatus("testing");
    setTestMsg("");
    try {
      const r = await fetch(`${form.url.replace(/\/$/, "")}/api/branch/info`);
      if (r.ok) {
        const d = await r.json();
        if (d.dmxi) {
          setTestStatus("ok");
          setTestMsg(`Connected — "${d.branchName}" (DMXI ${d.version})`);
          if (!form.name) setForm(f => ({ ...f, name: d.branchName }));
        } else {
          setTestStatus("fail");
          setTestMsg("URL responded but does not appear to be a DMXI instance.");
        }
      } else {
        setTestStatus("fail");
        setTestMsg(`Server returned ${r.status}.`);
      }
    } catch {
      setTestStatus("fail");
      setTestMsg("Could not reach that URL. Make sure the branch is online and the URL is correct.");
    }
  }

  async function addBranch() {
    setAddErr("");
    setAdding(true);
    try {
      const r = await fetch(`${API(cid)}/branches`, {
        method: "POST", headers: headers(),
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setAddErr(d.error ?? "Failed to add branch."); return; }
      setBranches(prev => [...prev, d]);
      setShowAdd(false);
      setForm({ name: "", url: "", secretKey: "" });
      setTestStatus("idle");
    } finally { setAdding(false); }
  }

  // ── Sync ─────────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  async function sync(b: BranchRow) {
    setSyncing(b.id);
    setSyncMsg(null);
    try {
      const r = await fetch(`${API(cid)}/branches/${b.id}/sync`, { method: "POST", headers: headers() });
      const d = await r.json();
      if (r.ok) {
        setSyncMsg({ id: b.id, ok: true, text: `Synced "${d.branchName}" successfully.` });
        setBranches(prev => prev.map(br => br.id === b.id ? { ...br, lastSyncAt: d.branch.lastSyncAt } : br));
      } else {
        setSyncMsg({ id: b.id, ok: false, text: d.error ?? "Sync failed." });
      }
    } finally { setSyncing(null); }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  async function deleteBranch(id: string) {
    await fetch(`${API(cid)}/branches/${id}`, { method: "DELETE", headers: headers() });
    setBranches(prev => prev.filter(b => b.id !== id));
    setConfirmDel(null);
    setSyncMsg(null);
  }

  // ── Snapshot viewer ──────────────────────────────────────────────────────
  const [viewing, setViewing] = useState<BranchRow | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  async function viewBranch(b: BranchRow) {
    setViewing(b);
    setSnapshot(null);
    setSnapshotLoading(true);
    const r = await fetch(`${API(cid)}/branches/${b.id}/snapshot`, { headers: headers() });
    if (r.ok) setSnapshot(await r.json());
    setSnapshotLoading(false);
  }

  // ── Copy helper ──────────────────────────────────────────────────────────
  const [copied, setCopied] = useState<string | null>(null);
  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (viewing && snapshot !== null) {
    const allInvoices = snapshot.companies.flatMap(c => c.invoices ?? []);
    const allExpenses = snapshot.companies.flatMap(c => c.expenses ?? []);
    const revenue  = allInvoices.reduce((s, inv) => s + Number(inv.total ?? 0), 0);
    const expenses = allExpenses.reduce((s, exp) => s + Number(exp.amount ?? 0), 0);

    return (
      <div>
        <div className="page-header">
          <div>
            <button className="btn" onClick={() => { setViewing(null); setSnapshot(null); }} style={{ marginBottom: 12, fontSize: 12 }}>
              ← Back to Branches
            </button>
            <h1 style={{ margin: 0 }}>{viewing.name}</h1>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              Last synced: {fmtDate(viewing.lastSyncAt)} · Exported: {snapshot.exportedAt ? fmtDate(snapshot.exportedAt) : "—"}
            </div>
          </div>
        </div>

        {snapshotLoading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>}

        {/* KPI row */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          {[
            { label: "Invoices", value: allInvoices.length },
            { label: "Expenses", value: allExpenses.length },
            { label: "Revenue", value: money(revenue) },
            { label: "Total Expenses", value: money(expenses) },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div className="label">{k.label}</div>
              <div className="value" style={{ fontSize: 20 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Companies */}
        {snapshot.companies.map(co => (
          <div key={co.id} className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{co.name}</div>

            {/* Invoices */}
            {co.invoices?.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Invoices</div>
                <div style={{ overflowX: "auto", marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>#</th><th>Customer</th><th>Date</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
                    <tbody>
                      {co.invoices.slice(0, 20).map((inv: any) => (
                        <tr key={inv.id}>
                          <td style={{ fontFamily: "monospace", fontSize: 12 }}>{inv.number}</td>
                          <td>{inv.customer?.name ?? "—"}</td>
                          <td style={{ fontSize: 12 }}>{new Date(inv.issueDate).toLocaleDateString()}</td>
                          <td><span className={`badge badge-${inv.status === "PAID" ? "green" : inv.status === "VOID" ? "gray" : inv.status === "OVERDUE" ? "red" : "blue"}`}>{inv.status}</span></td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(Number(inv.total ?? 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {co.invoices.length > 20 && <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 14px" }}>+{co.invoices.length - 20} more</div>}
                </div>
              </>
            )}

            {/* Expenses */}
            {co.expenses?.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Expenses</div>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Category</th><th>Vendor</th><th>Date</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                    <tbody>
                      {co.expenses.slice(0, 20).map((exp: any) => (
                        <tr key={exp.id}>
                          <td>{exp.category}</td>
                          <td>{exp.vendor?.name ?? "—"}</td>
                          <td style={{ fontSize: 12 }}>{new Date(exp.date).toLocaleDateString()}</td>
                          <td><span className={`badge badge-${exp.status === "PAID" ? "green" : exp.status === "CANCELLED" ? "gray" : "yellow"}`}>{exp.status}</span></td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(Number(exp.amount ?? 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {co.expenses.length > 20 && <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 14px" }}>+{co.expenses.length - 20} more</div>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Branches</h1>
        <button className="btn btn-primary" onClick={() => { setShowAdd(true); setForm({ name: "", url: "", secretKey: "" }); setTestStatus("idle"); setAddErr(""); }}>
          + Connect Branch
        </button>
      </div>

      {/* ── This Instance ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          This Instance (Your Branch Identity)
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16, lineHeight: 1.7 }}>
          Share the <strong>URL</strong> and <strong>Secret Key</strong> below with your HQ so they can connect to this branch.
          The secret key authenticates sync requests — keep it private.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Branch URL", value: myUrl, key: "url" },
            { label: "Branch ID", value: myInfo?.branchId ?? "Loading…", key: "bid" },
            { label: "Secret Key", value: myInfo ? "sk_" + myInfo.branchId.replace(/-/g, "").slice(0, 8) + "…  (visible in branch-config.json)" : "Loading…", key: "sk", mono: true },
          ].map(row => (
            <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", width: 100, flexShrink: 0 }}>{row.label}</span>
              <code style={{ flex: 1, minWidth: 0, fontSize: 12, background: "var(--bg)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.key === "url" ? myUrl : row.value}
              </code>
              {row.key === "url" && (
                <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => copyText(myUrl, "url")}>
                  {copied === "url" ? "Copied!" : "Copy"}
                </button>
              )}
              {row.key === "bid" && myInfo && (
                <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => copyText(myInfo.branchId, "bid")}>
                  {copied === "bid" ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
          ))}

          {/* Edit branch name */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", width: 100, flexShrink: 0 }}>Branch Name</span>
            <input
              style={{ flex: 1, minWidth: 0, maxWidth: 280 }}
              placeholder={myInfo?.branchName ?? "Branch"}
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveMyName()}
            />
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "5px 14px" }} onClick={saveMyName} disabled={savingName || !editingName.trim()}>
              {savingName ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Connected Branches ─────────────────────────────────────────────── */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Connected Branches</div>

      {loading && <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>}

      {!loading && branches.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", fontSize: 13 }}>
          No branches connected yet. Click <strong>Connect Branch</strong> to add one.
        </div>
      )}

      {branches.map(b => (
        <div key={b.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(36,84,255,0.08)", border: "1px solid rgba(36,84,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.url}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Last synced: {fmtDate(b.lastSyncAt)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}
                onClick={() => sync(b)} disabled={syncing === b.id}>
                {syncing === b.id ? "Syncing…" : "Sync Now"}
              </button>
              {b.lastSyncAt && (
                <button className="btn" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => viewBranch(b)}>
                  View Data
                </button>
              )}
              {confirmDel === b.id ? (
                <>
                  <button className="btn" style={{ fontSize: 12, padding: "6px 14px", color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => deleteBranch(b.id)}>
                    Confirm Remove
                  </button>
                  <button className="btn" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => setConfirmDel(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn" style={{ fontSize: 12, padding: "6px 14px", color: "var(--muted)" }} onClick={() => setConfirmDel(b.id)}>Remove</button>
              )}
            </div>
          </div>

          {syncMsg?.id === b.id && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: syncMsg.ok ? "rgba(22,163,74,0.07)" : "rgba(220,38,38,0.07)",
              color: syncMsg.ok ? "#16a34a" : "var(--danger)",
              border: `1px solid ${syncMsg.ok ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}`,
            }}>{syncMsg.text}</div>
          )}
        </div>
      ))}

      {/* ── Add Branch Modal ───────────────────────────────────────────────── */}
      {showAdd && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2>Connect a Branch</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
              Get the branch URL and secret key from the branch's DMXI instance (Settings → Branches → This Instance).
            </p>

            <div className="form-grid">
              <label>
                Branch Name
                <input placeholder="e.g. Nairobi Branch" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </label>
              <label>
                Branch URL
                <div style={{ display: "flex", gap: 8 }}>
                  <input placeholder="https://…" value={form.url} onChange={e => { setForm(f => ({ ...f, url: e.target.value })); setTestStatus("idle"); }} />
                  <button className="btn" style={{ flexShrink: 0, fontSize: 12 }} onClick={testConnection} disabled={!form.url || testStatus === "testing"}>
                    {testStatus === "testing" ? "…" : "Test"}
                  </button>
                </div>
                {testStatus !== "idle" && (
                  <span style={{ fontSize: 12, color: testStatus === "ok" ? "#16a34a" : "var(--danger)", marginTop: 4 }}>
                    {testStatus === "ok" ? "✓ " : "✗ "}{testMsg}
                  </span>
                )}
              </label>
              <label>
                Secret Key
                <input placeholder="64-character hex key from branch-config.json" value={form.secretKey} onChange={e => setForm(f => ({ ...f, secretKey: e.target.value }))} />
              </label>
            </div>

            {addErr && <div className="error-text">{addErr}</div>}

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addBranch}
                disabled={adding || !form.name || !form.url || !form.secretKey}>
                {adding ? "Connecting…" : "Connect Branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
