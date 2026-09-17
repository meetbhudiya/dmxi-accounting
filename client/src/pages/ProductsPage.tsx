import { useEffect, useRef, useState, type FormEvent } from "react";
import * as XLSX from "xlsx";
import { useCompanyApi } from "../api/useCompanyApi";
import type { Brand, Product } from "../api/types";
import { ApiError } from "../api/client";
import Modal from "../components/Modal";
import { money } from "../lib/format";

// ── Excel helpers ─────────────────────────────────────────────────────────────

const HEADERS = ["Name*", "SKU", "Brand", "Description", "Unit Price*", "Unit", "Stock Qty", "Reorder Level"];

function exportToExcel(products: Product[]) {
  const rows = products.map((p) => [
    p.name,
    p.sku ?? "",
    p.brand?.name ?? "",
    p.description ?? "",
    Number(p.unitPrice),
    p.unit ?? "",
    Number(p.stockQty ?? 0),
    Number(p.reorderLevel ?? 0),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws["!cols"] = [28, 16, 18, 32, 14, 10, 12, 15].map((w) => ({ wch: w }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const instructions = [
    ["DMXI Product Import Template — Instructions"],
    [],
    ["Column", "Required", "Notes"],
    ["Name*",          "Yes", "Product name — must be unique per brand"],
    ["SKU",            "No",  "Stock Keeping Unit code — useful for POS and barcode scanning"],
    ["Brand",          "No",  "Brand name — created automatically if it doesn't exist"],
    ["Description",    "No",  "Optional short description"],
    ["Unit Price*",    "Yes", "Selling / unit price (number)"],
    ["Unit",           "No",  'e.g. pcs, kg, ltr, box, dozen'],
    ["Stock Qty",      "No",  "Opening stock quantity (default: 0)"],
    ["Reorder Level",  "No",  "Alert when stock falls below this (default: 0 = no alert)"],
    [],
    ["Tips"],
    ["- Do not change the column headers in the Products sheet"],
    ["- Rows with an empty Name or Unit Price will be skipped"],
    ["- If a product with the same Name + Brand already exists it is skipped (not duplicated)"],
    ["- SKU must be unique per product — leave blank if not using POS"],
    ["- Delete the sample row before importing if you don't want it"],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2["!cols"] = [28, 12, 56].map((w) => ({ wch: w }));

  if (products.length === 0) {
    XLSX.utils.sheet_add_aoa(ws, [["Sample Product", "SKU-001", "My Brand", "A sample item", 1500, "pcs", 10, 5]], { origin: "A2" });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws,  "Products");
  XLSX.utils.book_append_sheet(wb, ws2, "Instructions");

  XLSX.writeFile(wb, "DMXI_Products_Template.xlsx");
}

interface ImportRow {
  name: string;
  sku: string;
  brandName: string;
  description: string;
  unitPrice: number;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  _error?: string;
}

function parseExcel(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

        const mapped: ImportRow[] = rows.map((r) => {
          const name      = String(r["Name*"] ?? r["Name"] ?? "").trim();
          const unitPrice = parseFloat(String(r["Unit Price*"] ?? r["Unit Price"] ?? "0")) || 0;
          const error     = !name ? "Name is required" : unitPrice <= 0 ? "Unit Price must be > 0" : undefined;
          return {
            name,
            sku:          String(r["SKU"] ?? "").trim(),
            brandName:    String(r["Brand"] ?? "").trim(),
            description:  String(r["Description"] ?? "").trim(),
            unitPrice,
            unit:         String(r["Unit"] ?? "").trim(),
            stockQty:     parseFloat(String(r["Stock Qty"] ?? "0")) || 0,
            reorderLevel: parseFloat(String(r["Reorder Level"] ?? "0")) || 0,
            _error:       error,
          };
        }).filter((r) => r.name || r._error);

        resolve(mapped);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const companyApi = useCompanyApi();
  const [products,     setProducts]     = useState<Product[]>([]);
  const [brands,       setBrands]       = useState<Brand[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [showModal,    setShowModal]    = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [editing,      setEditing]      = useState<Product | null>(null);
  const [brandFilter,  setBrandFilter]  = useState("");
  const [exportState, setExportState] = useState<"idle" | "loading" | "done">("idle");

  function load() {
    setLoading(true);
    Promise.all([
      companyApi.get<Product[]>("/products/all"),
      companyApi.get<Brand[]>("/brands"),
    ])
      .then(([p, b]) => { setProducts(p); setBrands(b); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [companyApi]);

  async function toggleActive(p: Product) {
    try {
      const updated = await companyApi.patch<Product>(`/products/${p.id}`, { isActive: !p.isActive });
      setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update product");
    }
  }

  const filtered = brandFilter ? products.filter((p) => p.brandId === brandFilter) : products;

  function handleExport() {
    setExportState("loading");
    // Let React paint the bar, then run the synchronous SheetJS work
    setTimeout(() => {
      exportToExcel(products);
      setExportState("done");
      setTimeout(() => setExportState("idle"), 2500);
    }, 600);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Products</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("dmxi:manageBrands"))}>
            Manage Brands
          </button>

          {/* Export button */}
          <button
            className="btn"
            onClick={handleExport}
            disabled={exportState === "loading"}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: exportState === "done" ? "#f0fdf4" : undefined,
              color: exportState === "done" ? "#16a34a" : exportState === "loading" ? "var(--muted)" : undefined,
              borderColor: exportState === "done" ? "#bbf7d0" : undefined,
              transition: "all 0.2s",
            }}
          >
            {exportState === "done" ? (
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            ) : exportState === "loading" ? (
              <span style={{ width: 14, height: 14, border: "2px solid var(--border)", borderTopColor: "#2454ff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
            ) : (
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            )}
            {exportState === "loading" ? "Preparing…" : exportState === "done" ? "Downloaded!" : "Export Excel"}
          </button>

          {/* Import button */}
          <button
            onClick={() => setShowImport(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, border: "1.5px solid #86efac",
              background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(22,163,74,0.3)",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 14px rgba(22,163,74,0.45)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(22,163,74,0.3)")}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            Import Excel
          </button>

          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            + New product
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bar-sweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
        @keyframes bar-done  { 0%{opacity:1} 100%{opacity:0} }
      `}</style>

      {/* Export progress bar */}
      {exportState === "loading" && (
        <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden", margin: "-8px 0 12px" }}>
          <div style={{
            height: "100%", width: "30%", borderRadius: 2,
            background: "linear-gradient(90deg, transparent, #2454ff, #6090ff, #2454ff, transparent)",
            animation: "bar-sweep 1.1s ease-in-out infinite",
            boxShadow: "0 0 10px rgba(36,84,255,0.6)",
          }} />
        </div>
      )}
      {exportState === "done" && (
        <div style={{ height: 3, borderRadius: 2, background: "#2454ff", margin: "-8px 0 12px", animation: "bar-done 0.5s ease 0.3s forwards", opacity: 1 }} />
      )}

      {error && <div className="error-text">{error}</div>}

      {/* Brand filter pills */}
      {brands.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Brand</span>
          <button
            className="btn"
            style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: !brandFilter ? "var(--primary, #2454ff)" : undefined,
              color: !brandFilter ? "#fff" : undefined }}
            onClick={() => setBrandFilter("")}
          >All</button>
          {brands.map((b) => (
            <button key={b.id} className="btn"
              style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: brandFilter === b.id ? "var(--primary, #2454ff)" : undefined,
                color: brandFilter === b.id ? "#fff" : undefined }}
              onClick={() => setBrandFilter(brandFilter === b.id ? "" : b.id)}
            >{b.name}</button>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Brand</th>
              <th>Description</th>
              <th>Unit price</th>
              <th>Unit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td>
                  {p.sku
                    ? <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px", color: "var(--text)" }}>{p.sku}</span>
                    : <span className="muted">—</span>}
                </td>
                <td>
                  {p.brand ? (
                    <span style={{ fontSize: 12, fontWeight: 600, background: "#eff6ff", color: "#2454ff", borderRadius: 12, padding: "2px 10px" }}>
                      {p.brand.name}
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="muted">{p.description ?? "—"}</td>
                <td>{money(p.unitPrice)}</td>
                <td>{p.unit ?? "—"}</td>
                <td>
                  <span className={`badge ${p.isActive ? "badge-green" : "badge-gray"}`}>
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => { setEditing(p); setShowModal(true); }}>
                    Edit
                  </button>
                  <button className="btn" onClick={() => toggleActive(p)}>
                    {p.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  {brandFilter ? "No products under this brand." : "No products yet. Create one to use it in invoices."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ProductModal
          product={editing}
          brands={brands}
          existing={products}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
          onBrandCreated={(b) => setBrands((prev) => [...prev, b].sort((a, z) => a.name.localeCompare(z.name)))}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      <BrandsModal brands={brands} onChanged={load} />
    </div>
  );
}

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const companyApi  = useCompanyApi();
  const fileRef     = useRef<HTMLInputElement>(null);
  const [rows,      setRows]    = useState<ImportRow[] | null>(null);
  const [fileName,  setFileName]= useState("");
  const [busy,      setBusy]    = useState(false);
  const [parsing,   setParsing] = useState(false);
  const [result,    setResult]  = useState<{ created: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const [parseErr,  setParseErr]= useState<string | null>(null);
  const [isDragging,setIsDragging]=useState(false);

  const step = result ? 3 : rows ? 2 : 1;

  async function processFile(file: File) {
    setParseErr(null); setRows(null); setResult(null); setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseExcel(file);
      if (parsed.length === 0) { setParseErr("No data rows found. Make sure the Products sheet has rows below the header."); return; }
      setRows(parsed);
    } catch {
      setParseErr("Could not read the file. Make sure it is a valid .xlsx, .xls, or .csv file.");
    } finally { setParsing(false); }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0]; if (file) processFile(file);
  }

  async function handleImport() {
    if (!rows) return;
    const valid = rows.filter((r) => !r._error);
    if (!valid.length) return;
    setBusy(true);
    try {
      const res = await companyApi.post<{ created: number; skipped: number; errors: { row: number; message: string }[] }>(
        "/products/bulk-import",
        { products: valid.map(({ _error: _, ...r }) => r) }
      );
      setResult(res);
    } catch (err) {
      setParseErr(err instanceof ApiError ? err.message : "Import failed");
    } finally { setBusy(false); }
  }

  const validRows   = rows?.filter((r) => !r._error) ?? [];
  const invalidRows = rows?.filter((r) => !!r._error) ?? [];

  const STEPS = [{ n: 1, label: "Upload" }, { n: 2, label: "Preview" }, { n: 3, label: "Done" }];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(8,12,25,0.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: "min(760px, 100%)", maxHeight: "90vh", background: "var(--surface)", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)" }}>

        {/* ── Header ── */}
        <div style={{ padding: "22px 28px", background: "linear-gradient(135deg, #0a0f1e 0%, #111827 100%)", flexShrink: 0, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(36,84,255,0.18)", border: "1px solid rgba(96,144,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#6090ff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>Import Products</div>
            <div style={{ fontSize: 12, color: "#4a5a72", marginTop: 1 }}>Bulk-create products from an Excel file</div>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {STEPS.map(({ n, label }, i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, transition: "all 0.25s",
                    background: step > n ? "#16a34a" : step === n ? "#2454ff" : "rgba(255,255,255,0.07)",
                    border: `2px solid ${step > n ? "#4ade80" : step === n ? "#6090ff" : "rgba(255,255,255,0.12)"}`,
                    color: step >= n ? "#fff" : "#4a5a72",
                  }}>{step > n ? "✓" : n}</div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: step === n ? "#6090ff" : step > n ? "#4ade80" : "#4a5a72", transition: "color 0.25s" }}>{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ width: 24, height: 2, borderRadius: 2, marginBottom: 12, background: step > n ? "#16a34a" : "rgba(255,255,255,0.1)", transition: "background 0.3s" }} />
                )}
              </div>
            ))}
          </div>

          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Phase 1 — Upload */}
          {step === 1 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { icon: "⬇️", title: "Get the template", desc: 'Click "Export Excel" on this page. It downloads a ready-to-fill template with your existing products.' },
                  { icon: "✏️", title: "Fill it in", desc: "Add your products in the Products sheet. The Instructions tab explains every column." },
                  { icon: "⬆️", title: "Upload here", desc: "Drop or choose the completed file below. Existing products are automatically skipped." },
                ].map(({ icon, title, desc }, i) => (
                  <div key={i} style={{ padding: "16px", borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 5 }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}>{desc}</div>
                  </div>
                ))}
              </div>

              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "#2454ff" : "var(--border)"}`,
                  borderRadius: 16, padding: "48px 24px", textAlign: "center", cursor: "pointer",
                  background: isDragging ? "rgba(36,84,255,0.05)" : "var(--bg)",
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  width: 60, height: 60, borderRadius: 18, margin: "0 auto 18px",
                  background: isDragging ? "rgba(36,84,255,0.15)" : "rgba(36,84,255,0.08)",
                  border: `1px solid ${isDragging ? "rgba(36,84,255,0.5)" : "rgba(36,84,255,0.2)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                }}>
                  <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={isDragging ? "#2454ff" : "#6090ff"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
                  {parsing ? "Reading file…" : isDragging ? "Drop it here!" : "Drag & drop your Excel file"}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                  {parsing ? "Please wait" : "or click anywhere here to browse"}
                </div>
                <div style={{ display: "inline-flex", gap: 6, justifyContent: "center" }}>
                  {[".xlsx", ".xls", ".csv"].map((ext) => (
                    <span key={ext} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: "rgba(36,84,255,0.08)", color: "#2454ff", border: "1px solid rgba(36,84,255,0.2)" }}>{ext}</span>
                  ))}
                </div>
              </div>

              {parseErr && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>
                  ✕ {parseErr}
                </div>
              )}
            </>
          )}

          {/* Phase 2 — Preview */}
          {step === 2 && rows && (
            <>
              {/* File bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {rows.length} rows detected
                    {validRows.length > 0 && <span style={{ color: "#16a34a", marginLeft: 8, fontWeight: 600 }}>· {validRows.length} valid</span>}
                    {invalidRows.length > 0 && <span style={{ color: "#dc2626", marginLeft: 8, fontWeight: 600 }}>· {invalidRows.length} will be skipped</span>}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />
                <button className="btn" style={{ fontSize: 11, padding: "5px 12px", flexShrink: 0 }} onClick={() => { setRows(null); setFileName(""); if (fileRef.current) fileRef.current.value = ""; }}>
                  Change file
                </button>
              </div>

              {parseErr && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>✕ {parseErr}</div>
              )}

              {/* Preview table */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "var(--bg)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Preview — showing {Math.min(rows.length, 50)} of {rows.length} rows
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {validRows.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 5, padding: "2px 8px" }}>{validRows.length} OK</span>}
                    {invalidRows.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 5, padding: "2px 8px" }}>{invalidRows.length} Skip</span>}
                  </div>
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  <table style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "9px 12px", width: 36 }}>#</th>
                        <th style={{ padding: "9px 12px" }}>Name</th>
                        <th style={{ padding: "9px 12px" }}>SKU</th>
                        <th style={{ padding: "9px 12px" }}>Brand</th>
                        <th style={{ padding: "9px 12px", textAlign: "right" }}>Unit Price</th>
                        <th style={{ padding: "9px 12px" }}>Unit</th>
                        <th style={{ padding: "9px 12px", textAlign: "right" }}>Stock</th>
                        <th style={{ padding: "9px 12px", width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i} style={{ background: r._error ? "rgba(220,38,38,0.035)" : undefined }}>
                          <td style={{ padding: "7px 12px", color: "var(--muted)", fontSize: 11 }}>{i + 1}</td>
                          <td style={{ padding: "7px 12px", fontWeight: 600, color: r._error ? "#dc2626" : "var(--text)" }}>{r.name || "—"}</td>
                          <td style={{ padding: "7px 12px" }}>
                            {r.sku
                              ? <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 7px" }}>{r.sku}</span>
                              : <span style={{ color: "var(--muted)" }}>—</span>}
                          </td>
                          <td style={{ padding: "7px 12px" }}>
                            {r.brandName
                              ? <span style={{ fontSize: 11, fontWeight: 600, background: "#eff6ff", color: "#2454ff", borderRadius: 6, padding: "2px 8px" }}>{r.brandName}</span>
                              : <span style={{ color: "var(--muted)" }}>—</span>}
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, color: r.unitPrice > 0 ? "var(--text)" : "#dc2626" }}>
                            {r.unitPrice > 0 ? r.unitPrice.toLocaleString() : "—"}
                          </td>
                          <td style={{ padding: "7px 12px", color: "var(--muted)" }}>{r.unit || "—"}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--muted)" }}>{r.stockQty}</td>
                          <td style={{ padding: "7px 12px" }}>
                            {r._error
                              ? <span title={r._error} style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 5, padding: "2px 7px" }}>✕ Skip</span>
                              : <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 5, padding: "2px 7px" }}>✓ OK</span>}
                          </td>
                        </tr>
                      ))}
                      {rows.length > 50 && (
                        <tr><td colSpan={7} style={{ padding: "10px 12px", color: "var(--muted)", textAlign: "center", fontSize: 12, fontStyle: "italic" }}>+ {rows.length - 50} more rows (all will be processed)</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {invalidRows.length > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
                  <strong style={{ display: "block", marginBottom: 5, color: "#d97706" }}>⚠ {invalidRows.length} row{invalidRows.length !== 1 ? "s" : ""} will be skipped</strong>
                  {invalidRows.slice(0, 4).map((r, i) => (
                    <div key={i} style={{ marginTop: 2 }}>Row {rows.indexOf(r) + 1}: {r._error}</div>
                  ))}
                  {invalidRows.length > 4 && <div style={{ marginTop: 2, opacity: 0.7 }}>… and {invalidRows.length - 4} more</div>}
                </div>
              )}
            </>
          )}

          {/* Phase 3 — Results */}
          {step === 3 && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px",
                  background: result.created > 0 ? "linear-gradient(135deg, #f0fdf4, #dcfce7)" : "#fef9c3",
                  border: `2px solid ${result.created > 0 ? "#86efac" : "#fde68a"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
                }}>
                  {result.created > 0 ? "✓" : "⚠"}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", marginBottom: 6, letterSpacing: "-0.3px" }}>
                  {result.created > 0 ? "Import Complete!" : "Nothing New to Import"}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {result.created > 0
                    ? `Successfully created ${result.created} product${result.created !== 1 ? "s" : ""}.`
                    : "All rows already exist in your product catalogue."}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { label: "Created",  value: result.created,       color: "#16a34a", bg: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "#86efac" },
                  { label: "Skipped",  value: result.skipped,       color: "#d97706", bg: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "#fcd34d" },
                  { label: "Errors",   value: result.errors.length, color: result.errors.length > 0 ? "#dc2626" : "#64748b", bg: result.errors.length > 0 ? "linear-gradient(135deg,#fef2f2,#fee2e2)" : "var(--bg)", border: result.errors.length > 0 ? "#fca5a5" : "var(--border)" },
                ].map(({ label, value, color, bg, border }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "20px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                  </div>
                ))}
              </div>

              {result.errors.length > 0 && (
                <div style={{ padding: "14px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Errors ({result.errors.length})</div>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#b91c1c", paddingLeft: 8, marginTop: 3 }}>Row {e.row}: {e.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Progress bar ── */}
        {(parsing || busy) && (
          <div style={{ flexShrink: 0, padding: "0 28px 10px" }}>
            <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <div style={{
                height: "100%", width: "35%",
                background: "linear-gradient(90deg, transparent, #2454ff, #6090ff, #2454ff, transparent)",
                animation: "bar-sweep 1.1s ease-in-out infinite",
                boxShadow: "0 0 10px rgba(36,84,255,0.6)",
              }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 7, fontWeight: 600, letterSpacing: "0.03em" }}>
              {parsing ? "Reading file…" : "Uploading to server…"}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ padding: "16px 28px", flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="btn" onClick={onClose} style={{ padding: "9px 20px" }}>
            {result ? "Close" : "Cancel"}
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {step === 2 && validRows.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={busy}
                style={{ padding: "9px 24px", display: "flex", alignItems: "center", gap: 8 }}
              >
                {busy && (
                  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "_spin 0.6s linear infinite" }} />
                )}
                {busy ? "Importing…" : `Import ${validRows.length} product${validRows.length !== 1 ? "s" : ""} →`}
              </button>
            )}
            {step === 3 && result && result.created > 0 && (
              <button className="btn btn-primary" onClick={onImported} style={{ padding: "9px 24px" }}>
                View Products →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Brands manage modal (triggered by custom event) ───────────────────────────

function BrandsModal({ brands, onChanged }: { brands: Brand[]; onChanged: () => void }) {
  const companyApi = useCompanyApi();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handler() { setOpen(true); }
    window.addEventListener("dmxi:manageBrands", handler);
    return () => window.removeEventListener("dmxi:manageBrands", handler);
  }, []);

  async function addBrand(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      await companyApi.post("/brands", { name: newName.trim() });
      setNewName("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add brand");
    } finally { setBusy(false); }
  }

  async function deleteBrand(id: string) {
    if (!window.confirm("Delete this brand? Products assigned to it will become unbranded.")) return;
    try {
      await companyApi.del(`/brands/${id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete brand");
    }
  }

  if (!open) return null;
  return (
    <Modal title="Manage Brands" onClose={() => setOpen(false)}>
      <div style={{ minWidth: 340 }}>
        {brands.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>No brands yet.</p>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {brands.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontWeight: 600 }}>{b.name}</span>
                <button className="btn" style={{ fontSize: 11, padding: "2px 8px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
                  onClick={() => deleteBrand(b.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
        <form style={{ display: "flex", gap: 8 }} onSubmit={addBrand}>
          <input style={{ flex: 1 }} placeholder="Brand name, e.g. Shell, Total…" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
        </form>
        {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </Modal>
  );
}

// ── Product modal ─────────────────────────────────────────────────────────────

function ProductModal({
  product, brands, existing, onClose, onSaved, onBrandCreated,
}: {
  product: Product | null;
  brands: Brand[];
  existing: Product[];
  onClose: () => void;
  onSaved: () => void;
  onBrandCreated: (b: Brand) => void;
}) {
  const companyApi = useCompanyApi();
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [brandId, setBrandId] = useState(product?.brandId ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [unitPrice, setUnitPrice] = useState(product ? String(product.unitPrice) : "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [stockQty, setStockQty] = useState(product ? String(product.stockQty ?? 0) : "0");
  const [reorderLevel, setReorderLevel] = useState(product ? String(product.reorderLevel ?? 0) : "0");
  const [newBrand, setNewBrand] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const duplicate = name.trim()
    ? existing.find((p) =>
        p.id !== product?.id &&
        p.name.toLowerCase() === name.trim().toLowerCase() &&
        (p.brandId ?? "") === (brandId ?? "")
      )
    : null;

  async function handleAddBrand() {
    if (!newBrand.trim()) return;
    setCreatingBrand(true);
    try {
      const b = await companyApi.post<Brand>("/brands", { name: newBrand.trim() });
      onBrandCreated(b);
      setBrandId(b.id);
      setNewBrand("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create brand");
    } finally { setCreatingBrand(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        name,
        sku: sku.trim() || null,
        brandId: brandId || null,
        description: description || undefined,
        unitPrice: parseFloat(unitPrice) || 0,
        unit: unit || undefined,
        stockQty: parseFloat(stockQty) || 0,
        reorderLevel: parseFloat(reorderLevel) || 0,
      };
      if (product) {
        await companyApi.patch(`/products/${product.id}`, body);
      } else {
        await companyApi.post("/products", body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={product ? "Edit product" : "New product"} onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Product name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            SKU <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. SKU-001, ITEM-ABC"
              style={{ fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Brand
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">— No brand —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>
            Unit
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, kg, ltr…" />
          </label>
        </div>
        {duplicate && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 13px", fontSize: 12.5, color: "#92400e" }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>A product named <strong>"{duplicate.name}"</strong> already exists{duplicate.brandId ? ` under this brand` : " with no brand"}. Saving will be blocked — use a different name or brand.</span>
          </div>
        )}

        {/* Quick brand creation */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ flex: 1, fontSize: 13 }} placeholder="Or type new brand name…" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
          <button type="button" className="btn" style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap" }}
            onClick={handleAddBrand} disabled={!newBrand.trim() || creatingBrand}>
            {creatingBrand ? "Adding…" : "+ Add brand"}
          </button>
        </div>
        <div className="form-row">
          <label>
            Unit price
            <input type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required placeholder="0.00" />
          </label>
          <label>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </label>
        </div>
        <div className="form-row">
          <label>
            Opening / Current Stock
            <input type="number" min="0" step="any" value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="0" />
          </label>
          <label>
            Reorder Level
            <input type="number" min="0" step="any" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="0 = no alert" />
          </label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !!duplicate}>
            {submitting ? "Saving…" : product ? "Save changes" : "Create product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
