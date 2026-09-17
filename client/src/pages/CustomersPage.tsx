import { useEffect, useState, useMemo, type FormEvent } from "react";
import { useCompanyApi } from "../api/useCompanyApi";
import { useAuth } from "../auth/AuthContext";
import type { Customer, Invoice } from "../api/types";
import { ApiError } from "../api/client";
import Modal from "../components/Modal";
import { money } from "../lib/format";

export default function CustomersPage() {
  const companyApi = useCompanyApi();
  const { currentCompany } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices,  setInvoices]  = useState<Invoice[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showNew,   setShowNew]   = useState(false);
  const [editing,   setEditing]   = useState<Customer | null>(null);
  const [search,    setSearch]    = useState("");

  const canEdit = currentCompany?.role === "OWNER" || currentCompany?.role === "ADMIN";

  function load() {
    setLoading(true);
    Promise.all([
      companyApi.get<Customer[]>("/customers"),
      companyApi.get<Invoice[]>("/invoices"),
    ])
      .then(([c, inv]) => { setCustomers(c); setInvoices(inv); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyApi]);

  const balanceByCustomer = useMemo(() => {
    const map: Record<string, { receivable: number; invoiceCount: number }> = {};
    for (const inv of invoices) {
      const id = inv.customer.id;
      if (!map[id]) map[id] = { receivable: 0, invoiceCount: 0 };
      map[id].receivable  += Number(inv.balanceDue);
      map[id].invoiceCount += 1;
    }
    return map;
  }, [invoices]);

  const filtered = useMemo(() =>
    search
      ? customers.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (c.kraPin ?? "").toLowerCase().includes(search.toLowerCase())
        )
      : customers,
  [customers, search]);

  const totalReceivable = useMemo(
    () => Object.values(balanceByCustomer).reduce((s, v) => s + v.receivable, 0),
    [balanceByCustomer]
  );

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Customer</button>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Customers",  value: String(customers.length), sub: "registered",     color: "#2454ff" },
          { label: "Total Receivable", value: money(totalReceivable),   sub: "outstanding AR", color: "#d97706" },
          { label: "Total Invoices",   value: String(invoices.length),  sub: "all time",       color: "#16a34a" },
        ].map((c) => (
          <div key={c.label} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="card" style={{ padding: "12px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
        </svg>
        <input
          placeholder="Search by name, email or KRA PIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 13 }}
        />
        {search && (
          <button className="btn" style={{ fontSize: 11, padding: "3px 10px", color: "#dc2626", borderColor: "#fecaca" }} onClick={() => setSearch("")}>✕</button>
        )}
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
          {filtered.length} of {customers.length} customer{customers.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>KRA PIN</th>
              <th style={{ textAlign: "right", width: 80 }}>Invoices</th>
              <th style={{ textAlign: "right", width: 150 }}>Outstanding AR</th>
              {canEdit && <th style={{ width: 60 }} />}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={canEdit ? 7 : 6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                {search ? "No customers match your search." : "No customers yet. Create one to start invoicing."}
              </td></tr>
            )}
            {filtered.map((c) => {
              const stats = balanceByCustomer[c.id] ?? { receivable: 0, invoiceCount: 0 };
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, borderRadius: "50%", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0,
                        background: `hsl(${(c.name.charCodeAt(0) * 37) % 360}, 60%, 45%)`,
                      }}>
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div>{c.name}</div>
                        {c.address && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{c.address}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{c.email ?? "—"}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{c.phone ?? "—"}</td>
                  <td style={{ fontSize: 13 }}>
                    {c.kraPin ? (
                      <span style={{
                        fontFamily: "monospace", fontSize: 12, fontWeight: 600,
                        background: "var(--bg)", border: "1px solid var(--border)",
                        borderRadius: 4, padding: "2px 7px", color: "var(--text)",
                      }}>
                        {c.kraPin}
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{stats.invoiceCount}</td>
                  <td style={{ textAlign: "right" }}>
                    {stats.receivable > 0 ? (
                      <span style={{ fontWeight: 700, color: "#dc2626" }}>{money(stats.receivable)}</span>
                    ) : (
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>Settled</span>
                    )}
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: "4px 10px" }}
                        onClick={() => setEditing(c)}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                <td colSpan={canEdit ? 6 : 5} style={{ padding: "10px 16px", fontWeight: 600, fontSize: 13, color: "var(--muted)" }}>
                  Total outstanding
                </td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, color: "#dc2626" }}>
                  {money(filtered.reduce((s, c) => s + (balanceByCustomer[c.id]?.receivable ?? 0), 0))}
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showNew && (
        <CustomerModal
          existing={customers}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
      {editing && (
        <CustomerModal
          customer={editing}
          existing={customers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Shared Create / Edit modal ──────────────────────────────────────────────

function CustomerModal({
  customer,
  existing,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  existing: Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const companyApi = useCompanyApi();
  const isEdit = Boolean(customer);

  const [name,    setName]    = useState(customer?.name    ?? "");
  const [email,   setEmail]   = useState(customer?.email   ?? "");
  const [phone,   setPhone]   = useState(customer?.phone   ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [kraPin,  setKraPin]  = useState(customer?.kraPin  ?? "");
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  const duplicate = name.trim()
    ? existing.find((c) => c.id !== customer?.id && c.name.toLowerCase() === name.trim().toLowerCase())
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        name,
        email:   email   || undefined,
        phone:   phone   || undefined,
        address: address || undefined,
        kraPin:  kraPin  || undefined,
      };
      if (isEdit && customer) {
        await companyApi.patch(`/customers/${customer.id}`, body);
      } else {
        await companyApi.post("/customers", body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEdit ? "update" : "create"} customer`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? `Edit Customer — ${customer!.name}` : "New Customer"} onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Name <span style={{ color: "#dc2626" }}>*</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        {duplicate && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 13px", fontSize: 12.5, color: "#92400e" }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>A customer named <strong>"{duplicate.name}"</strong> already exists. Saving will be blocked — please use a different name or edit the existing record.</span>
          </div>
        )}

        <div className="form-row">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>

        <label>
          KRA PIN
          <input
            value={kraPin}
            onChange={(e) => setKraPin(e.target.value.toUpperCase())}
            placeholder="e.g. A123456789B"
            style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}
            maxLength={11}
          />
        </label>

        <label>
          Address
          <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !!duplicate}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Customer")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
