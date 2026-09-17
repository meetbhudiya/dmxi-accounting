import { useEffect, useState, useCallback } from "react";
import { useCompanyApi } from "../api/useCompanyApi";

interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string;
  entityRef?: string;
  changes?: Record<string, unknown>;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pages: number;
}

const ACTION_STYLE: Record<string, { bg: string; color: string }> = {
  CREATE: { bg: "#f0fdf4", color: "#16a34a" },
  UPDATE: { bg: "#eff6ff", color: "#2563eb" },
  DELETE: { bg: "#fef2f2", color: "#dc2626" },
  CANCEL: { bg: "#fef9c3", color: "#a16207" },
  VOID:   { bg: "#fdf4ff", color: "#7c3aed" },
};

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_STYLE[action] ?? { bg: "#f1f5f9", color: "#64748b" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
      textTransform: "uppercase", background: s.bg, color: s.color,
    }}>
      {action}
    </span>
  );
}

function ChangesCell({ changes }: { changes?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  if (!changes) return <span style={{ color: "var(--muted)" }}>—</span>;
  return (
    <div>
      <button
        className="btn"
        style={{ fontSize: 11, padding: "2px 8px" }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide" : "View"}
      </button>
      {open && (
        <pre style={{
          marginTop: 6, padding: "8px 10px", borderRadius: 6,
          background: "var(--bg, #f8fafc)", fontSize: 11,
          border: "1px solid var(--border)", maxWidth: 340,
          whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {JSON.stringify(changes, null, 2)}
        </pre>
      )}
    </div>
  );
}

const ENTITIES = ["Invoice", "Expense", "Payment", "Customer", "Vendor", "Product", "Purchase", "Attachment"];
const ACTIONS  = ["CREATE", "UPDATE", "DELETE", "CANCEL", "VOID"];

export default function AuditPage() {
  const companyApi = useCompanyApi();
  const [data,    setData]    = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [page,    setPage]    = useState(1);
  const [entity,  setEntity]  = useState("");
  const [action,  setAction]  = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);
    companyApi.get<AuditResponse>(`/audit?${params}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [companyApi, page, entity, action]);

  useEffect(load, [load]);

  function fmt(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div>
      <div className="page-header">
        <h1>Audit Trail</h1>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {data ? `${data.total} total events` : ""}
        </span>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* Filters */}
      <div className="card" style={{ padding: "12px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter</span>
        <label style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Type</span>
          <select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} style={{ width: 140 }}>
            <option value="">All</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Action</span>
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ width: 130 }}>
            <option value="">All</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        {(entity || action) && (
          <button className="btn" style={{ fontSize: 11, padding: "3px 10px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
            onClick={() => { setEntity(""); setAction(""); setPage(1); }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>Date &amp; Time</th>
              <th style={{ width: 200 }}>User</th>
              <th style={{ width: 90 }}>Action</th>
              <th style={{ width: 110 }}>Type</th>
              <th>Reference</th>
              <th style={{ width: 120 }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Loading…</td></tr>
            )}
            {!loading && data?.logs.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                No audit events found.
              </td></tr>
            )}
            {data?.logs.map((log) => (
              <tr key={log.id}>
                <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(log.createdAt)}</td>
                <td style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 500 }}>{log.userEmail}</div>
                </td>
                <td><ActionBadge action={log.action} /></td>
                <td style={{ fontSize: 13, color: "var(--muted)" }}>{log.entity}</td>
                <td>
                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--primary, #2454ff)" }}>
                    {log.entityRef ?? log.entityId.slice(0, 8)}
                  </span>
                </td>
                <td><ChangesCell changes={log.changes as Record<string, unknown> | undefined} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 20 }}>
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Page {page} of {data.pages}</span>
          <button className="btn" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
