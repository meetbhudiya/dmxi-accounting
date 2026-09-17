import { useEffect, useState, useMemo, type FormEvent } from "react";
import { useCompanyApi } from "../api/useCompanyApi";
import type { Vendor, Expense, Purchase } from "../api/types";
import { ApiError } from "../api/client";
import Modal from "../components/Modal";
import { money } from "../lib/format";

export default function VendorsPage() {
  const companyApi = useCompanyApi();
  const [vendors,   setVendors]   = useState<Vendor[]>([]);
  const [expenses,  setExpenses]  = useState<Expense[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search,    setSearch]    = useState("");

  function load() {
    setLoading(true);
    Promise.all([
      companyApi.get<Vendor[]>("/vendors"),
      companyApi.get<Expense[]>("/expenses"),
      companyApi.get<Purchase[]>("/purchases"),
    ])
      .then(([v, exp, pur]) => { setVendors(v); setExpenses(exp); setPurchases(pur); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyApi]);

  const balanceByVendor = useMemo(() => {
    const map: Record<string, { payable: number; txnCount: number }> = {};
    for (const exp of expenses) {
      if (!exp.vendor) continue;
      const id = exp.vendor.id;
      if (!map[id]) map[id] = { payable: 0, txnCount: 0 };
      if (exp.status === "UNPAID") map[id].payable += Number(exp.amount);
      if (exp.status !== "CANCELLED") map[id].txnCount += 1;
    }
    for (const pur of purchases) {
      if (!pur.vendor) continue;
      const id = pur.vendor.id;
      if (!map[id]) map[id] = { payable: 0, txnCount: 0 };
      if (pur.status === "UNPAID") map[id].payable += pur.items.reduce((s, i) => s + Number(i.unitCost) * Number(i.quantity), 0);
      if (pur.status !== "CANCELLED") map[id].txnCount += 1;
    }
    return map;
  }, [expenses, purchases]);

  const filtered = useMemo(() =>
    search ? vendors.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()) || (v.email ?? "").toLowerCase().includes(search.toLowerCase()))
           : vendors,
  [vendors, search]);

  const totalPayable = useMemo(
    () => Object.values(balanceByVendor).reduce((s, v) => s + v.payable, 0), [balanceByVendor]
  );

  return (
    <div>
      <div className="page-header">
        <h1>Vendors</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Vendor</button>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Vendors",  value: String(vendors.length),  sub: "registered",     color: "#2454ff" },
          { label: "Total Payable",  value: money(totalPayable),      sub: "outstanding AP", color: "#dc2626" },
          { label: "Transactions",   value: String(expenses.length + purchases.length), sub: "expenses + purchases", color: "#6b7785" },
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
        <input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 13 }} />
        {search && <button className="btn" style={{ fontSize: 11, padding: "3px 10px", color: "#dc2626", borderColor: "#fecaca" }} onClick={() => setSearch("")}>✕</button>}
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
          {filtered.length} of {vendors.length} vendor{vendors.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th style={{ textAlign: "right", width: 80 }}>Txns</th>
              <th style={{ textAlign: "right", width: 150 }}>Outstanding AP</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                {search ? "No vendors match your search." : "No vendors yet. Add one to start tracking expenses."}
              </td></tr>
            )}
            {filtered.map((v) => {
              const stats = balanceByVendor[v.id] ?? { payable: 0, txnCount: 0 };
              return (
                <tr key={v.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, borderRadius: "50%", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0,
                        background: `hsl(${(v.name.charCodeAt(0) * 53) % 360}, 55%, 42%)`,
                      }}>
                        {v.name.slice(0, 2).toUpperCase()}
                      </span>
                      {v.name}
                    </div>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{v.email ?? "—"}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{v.phone ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{stats.txnCount}</td>
                  <td style={{ textAlign: "right" }}>
                    {stats.payable > 0 ? (
                      <span style={{ fontWeight: 700, color: "#dc2626" }}>{money(stats.payable)}</span>
                    ) : (
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>Settled</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
                <td colSpan={4} style={{ padding: "10px 16px", fontWeight: 600, fontSize: 13, color: "var(--muted)" }}>
                  Total outstanding
                </td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, color: "#dc2626" }}>
                  {money(filtered.reduce((s, v) => s + (balanceByVendor[v.id]?.payable ?? 0), 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showModal && (
        <NewVendorModal existing={vendors} onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); load(); }} />
      )}
    </div>
  );
}

function NewVendorModal({ existing, onClose, onCreated }: { existing: Vendor[]; onClose: () => void; onCreated: () => void }) {
  const companyApi = useCompanyApi();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const duplicate = name.trim()
    ? existing.find((v) => v.name.toLowerCase() === name.trim().toLowerCase())
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await companyApi.post("/vendors", { name, email: email || undefined, phone: phone || undefined, address: address || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create vendor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Vendor" onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>

        {duplicate && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 13px", fontSize: 12.5, color: "#92400e" }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>A vendor named <strong>"{duplicate.name}"</strong> already exists. Saving will be blocked — please use a different name.</span>
          </div>
        )}

        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label>Address<textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !!duplicate}>{submitting ? "Creating…" : "Create Vendor"}</button>
        </div>
      </form>
    </Modal>
  );
}
