import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompanyApi } from "../api/useCompanyApi";
import type { Brand, Customer, Invoice, Product } from "../api/types";
import { ApiError } from "../api/client";

interface LineItem {
  brandId: string;
  product: string;
  description: string;
  qty: string;
  rate: string;
}

function emptyLine(): LineItem {
  return { brandId: "", product: "", description: "", qty: "1", rate: "" };
}

function calcTotals(
  items: LineItem[],
  discountPct: number,
  vatPct: number
) {
  const subtotal = items.reduce((sum, it) => {
    const qty = parseFloat(it.qty) || 0;
    const rate = parseFloat(it.rate) || 0;
    return sum + qty * rate;
  }, 0);
  const discountAmt = (subtotal * discountPct) / 100;
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = (afterDiscount * vatPct) / 100;
  const grandTotal = afterDiscount + vatAmt;
  return { subtotal, discountAmt, vatAmt, grandTotal };
}

function fmt(n: number): string {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SalesWorkstation() {
  const companyApi = useCompanyApi();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { quote?: { customer: string; items: { description: string; qty: number; unitPrice: number }[]; notes: string } } | null)?.quote;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState(prefill?.customer ?? "");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [items, setItems] = useState<LineItem[]>(
    prefill?.items.length
      ? prefill.items.map((it) => ({ brandId: "", product: "", description: it.description, qty: String(it.qty), rate: String(it.unitPrice) }))
      : [emptyLine()]
  );
  const [narration, setNarration] = useState(prefill?.notes ?? "");
  const [discountPct, setDiscountPct] = useState(0);
  const [vatPct, setVatPct] = useState(16);
  const [saleType, setSaleType] = useState<"credit" | "cash">("credit");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [brandDropRow, setBrandDropRow] = useState<number | null>(null);
  const [brandSearch, setBrandSearch] = useState("");
  const [productDropRow, setProductDropRow] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const [savedAsCash, setSavedAsCash] = useState(false);
  const [customerHighlight, setCustomerHighlight] = useState(-1);
  const [productHighlight, setProductHighlight] = useState(-1);
  const [brandHighlight, setBrandHighlight] = useState(-1);
  const customerRef = useRef<HTMLDivElement>(null);
  const customerDropRef = useRef<HTMLDivElement>(null);
  const productDropRef = useRef<HTMLDivElement>(null);
  const brandDropRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [focusNewRow, setFocusNewRow] = useState(false);

  useEffect(() => {
    companyApi.get<Customer[]>("/customers").then(setCustomers).catch(() => null);
    companyApi.get<Product[]>("/products").then(setProducts).catch(() => null);
    companyApi.get<Brand[]>("/brands").then(setBrands).catch(() => null);
  }, [companyApi]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);


  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Matches for the currently-open product/brand dropdown (used by keyboard handler)
  const openProductMatches = useMemo(() => {
    if (productDropRow === null) return [];
    const item = items[productDropRow];
    if (!item) return [];
    return products.filter((p) => {
      if (item.brandId && p.brandId !== item.brandId) return false;
      return item.product.trim() === ""
        ? true
        : p.name.toLowerCase().includes(item.product.toLowerCase());
    });
  }, [productDropRow, items, products]);

  const openBrandMatches = useMemo(() =>
    brands.filter((b) => brandSearch.trim() === "" ? true : b.name.toLowerCase().includes(brandSearch.toLowerCase())),
    [brands, brandSearch]
  );

  // Reset highlight when dropdown closes
  useEffect(() => { setCustomerHighlight(-1); }, [customerDropdownOpen]);
  useEffect(() => { setProductHighlight(-1); }, [productDropRow]);
  useEffect(() => { setBrandHighlight(-1); }, [brandDropRow]);

  function selectCustomer(c: Customer) {
    setCustomerId(c.id);
    setCustomerSearch(c.name);
    setCustomerDropdownOpen(false);
  }

  // After adding a new row, focus its product input once the DOM updates
  useEffect(() => {
    if (!focusNewRow) return;
    setFocusNewRow(false);
    const form = formRef.current;
    if (!form) return;
    const productInputs = form.querySelectorAll<HTMLInputElement>('[data-fi="product"]');
    productInputs[productInputs.length - 1]?.focus();
  }, [focusNewRow, items.length]);

  // Scroll highlighted items into view
  useEffect(() => {
    if (customerHighlight >= 0 && customerDropRef.current)
      (customerDropRef.current.children[customerHighlight] as HTMLElement)?.scrollIntoView({ block: "nearest" });
  }, [customerHighlight]);

  useEffect(() => {
    if (productHighlight >= 0 && productDropRef.current)
      (productDropRef.current.children[productHighlight] as HTMLElement)?.scrollIntoView({ block: "nearest" });
  }, [productHighlight]);

  useEffect(() => {
    if (brandHighlight >= 0 && brandDropRef.current)
      // +1 because child[0] is the "All brands" clear option
      (brandDropRef.current.children[brandHighlight + 1] as HTMLElement)?.scrollIntoView({ block: "nearest" });
  }, [brandHighlight]);

  function navInputs(form: HTMLFormElement) {
    return Array.from(
      form.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]), textarea:not([disabled])')
    );
  }

  function advanceField(current: HTMLElement, form: HTMLFormElement) {
    const all = navInputs(form);
    const idx = all.indexOf(current);
    if (idx >= 0 && idx < all.length - 1) {
      const next = all[idx + 1];
      next.focus();
      if (next instanceof HTMLInputElement) next.select();
    } else if (idx === all.length - 1) {
      form.requestSubmit();
    }
  }

  function retreatField(current: HTMLElement, form: HTMLFormElement) {
    const all = navInputs(form);
    const idx = all.indexOf(current);
    if (idx > 0) {
      const prev = all[idx - 1];
      prev.focus();
      if (prev instanceof HTMLInputElement) prev.select();
    }
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") return;

    const fi = (target as HTMLInputElement).dataset.fi;

    // Arrow key navigation through open dropdowns
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const dir = e.key === "ArrowDown" ? 1 : -1;
      if (fi === "customer" && customerDropdownOpen && filteredCustomers.length > 0) {
        e.preventDefault();
        setCustomerHighlight(prev => { const n = prev + dir; return n < 0 ? filteredCustomers.length - 1 : n >= filteredCustomers.length ? 0 : n; });
        return;
      }
      if (fi === "product" && productDropRow !== null && openProductMatches.length > 0) {
        e.preventDefault();
        setProductHighlight(prev => { const n = prev + dir; return n < 0 ? openProductMatches.length - 1 : n >= openProductMatches.length ? 0 : n; });
        return;
      }
      if (fi === "brand" && brandDropRow !== null && openBrandMatches.length > 0) {
        e.preventDefault();
        setBrandHighlight(prev => { const n = prev + dir; return n < 0 ? openBrandMatches.length - 1 : n >= openBrandMatches.length ? 0 : n; });
        return;
      }
      return;
    }

    // Escape: close dropdowns first; if none were open, navigate back
    if (e.key === "Escape") {
      const anyOpen = customerDropdownOpen || productDropRow !== null || brandDropRow !== null;
      setCustomerDropdownOpen(false);
      setProductDropRow(null);
      setBrandDropRow(null);
      if (!anyOpen) navigate("/invoices");
      return;
    }

    // Backspace on empty field retreats to previous field
    if (e.key === "Backspace" && (target as HTMLInputElement).value === "") {
      if (customerDropdownOpen || productDropRow !== null || brandDropRow !== null) {
        setCustomerDropdownOpen(false); setProductDropRow(null); setBrandDropRow(null);
        return;
      }
      e.preventDefault();
      retreatField(target, e.currentTarget);
      return;
    }

    if (e.key !== "Enter") return;
    if (target.tagName === "TEXTAREA") return;
    e.preventDefault();

    // Customer: select highlighted or first match, then advance
    if (fi === "customer") {
      const pick = customerHighlight >= 0 ? filteredCustomers[customerHighlight] : filteredCustomers.length > 0 ? filteredCustomers[0] : null;
      if (pick && !customerId) selectCustomer(pick);
      setCustomerDropdownOpen(false);
      advanceField(target, e.currentTarget);
      return;
    }

    // Product: select highlighted item if one is active
    if (fi === "product" && productDropRow !== null) {
      const p = productHighlight >= 0 ? openProductMatches[productHighlight] : null;
      if (p) {
        updateItem(productDropRow, { product: p.name, description: p.description ?? "", rate: String(p.unitPrice) });
        setProductDropRow(null);
      }
      advanceField(target, e.currentTarget);
      return;
    }

    // Brand: select highlighted item if one is active
    if (fi === "brand" && brandDropRow !== null) {
      const b = brandHighlight >= 0 ? openBrandMatches[brandHighlight] : null;
      if (b) {
        const row = parseInt((target as HTMLInputElement).dataset.row ?? "0");
        updateItem(row, { brandId: b.id, product: "", description: "", rate: "" });
        setBrandDropRow(null);
      }
      advanceField(target, e.currentTarget);
      return;
    }

    // Rate on last row: add a new row and focus its product field
    if (fi === "rate") {
      const row = parseInt((target as HTMLInputElement).dataset.row ?? "0");
      if (row === items.length - 1) {
        setItems((prev) => [...prev, emptyLine()]);
        setFocusNewRow(true);
        return;
      }
    }

    advanceField(target, e.currentTarget);
  }

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i: number) {
    setItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  }

  const { subtotal, discountAmt, vatAmt, grandTotal } = calcTotals(items, discountPct, vatPct);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId) { setError("Please select a customer"); return; }
    if (!invoiceDate) { setError("Invoice date is required"); return; }
    if (!dueDate) { setError("Due date is required"); return; }

    const cleanItems = items
      .filter((it) => it.product.trim() || it.description.trim())
      .map((it) => ({
        product: it.product || undefined,
        description: it.description || it.product || "—",
        quantity: parseFloat(it.qty) || 1,
        unitPrice: parseFloat(it.rate) || 0,
      }));

    if (cleanItems.length === 0) { setError("Add at least one line item"); return; }

    setSubmitting(true);
    try {
      const saved = await companyApi.post<Invoice>("/invoices", {
        customerId,
        issueDate: invoiceDate,
        dueDate,
        reference: reference || undefined,
        notes: narration || undefined,
        discountPercent: discountPct,
        vatPercent: vatPct,
        items: cleanItems,
      });

      if (saleType === "cash") {
        await companyApi.post(`/invoices/${saved.id}/payments`, {
          amount: grandTotal,
          date: invoiceDate,
          method: paymentMethod,
          notes: "Cash sale — paid at point of sale",
        });
        setSavedAsCash(true);
      } else {
        setSavedAsCash(false);
      }

      setSavedInvoice(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save invoice");
    } finally {
      setSubmitting(false);
    }
  }

  if (savedInvoice) {
    return (
      <div style={styles.page}>
        <div style={styles.successBox}>
          <div style={{ fontSize: 48 }}>{savedAsCash ? "💵" : "🧾"}</div>
          <h2 style={{ margin: "8px 0" }}>
            {savedAsCash ? "Cash Sale Recorded!" : `Invoice ${savedInvoice.number} saved!`}
          </h2>
          <p style={{ color: "var(--muted)", margin: "0 0 8px" }}>
            {selectedCustomer?.name} · KSh {fmt(Number(savedInvoice.grandTotal))}
          </p>
          {savedAsCash && (
            <p style={{ color: "#16a34a", fontWeight: 600, margin: "0 0 16px", fontSize: 14 }}>
              ✓ Payment of KSh {fmt(grandTotal)} received via {paymentMethod} — invoice marked PAID
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => navigate(`/invoices/${savedInvoice.id}`)}>
              View invoice
            </button>
            <button className="btn" style={styles.btnGhost} onClick={() => {
              setSavedInvoice(null);
              setItems([emptyLine()]);
              setCustomerId(""); setCustomerSearch(""); setNarration(""); setReference("");
              setDiscountPct(0); setVatPct(16); setSaleType("credit"); setPaymentMethod("Cash");
            }}>
              New invoice
            </button>
            <button className="btn" style={styles.btnGhost} onClick={() => navigate("/invoices")}>
              All invoices
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form ref={formRef} onSubmit={handleSave} onKeyDown={handleFormKeyDown}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Sales Workstation</h1>
            <div style={styles.subtitle}>Professional invoice creation module</div>
          </div>
          <button type="button" className="btn" style={styles.btnGhost} onClick={() => navigate("/invoices")}>
            ← Back
          </button>
        </div>

        {/* Sale type toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "2px solid", borderColor: saleType === "cash" ? "#16a34a" : "#2454ff", alignSelf: "flex-start" }}>
          <button
            type="button"
            onClick={() => setSaleType("credit")}
            style={{
              flex: 1, padding: "12px 28px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, letterSpacing: "0.02em",
              background: saleType === "credit" ? "#2454ff" : "var(--surface)",
              color: saleType === "credit" ? "#fff" : "var(--muted)",
              transition: "all 0.15s",
            }}
          >
            🧾 Credit Sale
          </button>
          <button
            type="button"
            onClick={() => setSaleType("cash")}
            style={{
              flex: 1, padding: "12px 28px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, letterSpacing: "0.02em",
              background: saleType === "cash" ? "#16a34a" : "var(--surface)",
              color: saleType === "cash" ? "#fff" : "var(--muted)",
              transition: "all 0.15s",
            }}
          >
            💵 Cash Sale
          </button>
        </div>

        {/* Cash sale: payment method */}
        {saleType === "cash" && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 20px", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>Payment received via</span>
            {["Cash", "M-Pesa", "Bank Transfer", "Cheque", "Card"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                style={{
                  padding: "6px 16px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: paymentMethod === m ? "#16a34a" : "#fff",
                  color: paymentMethod === m ? "#fff" : "#15803d",
                  borderColor: paymentMethod === m ? "#16a34a" : "#bbf7d0",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Top fields */}
        <div style={styles.topCard}>
          <div style={styles.topGrid}>
            {/* Customer */}
            <div>
              <label style={styles.fieldLabel}>Customer</label>
              <div ref={customerRef} style={{ position: "relative" }}>
                <input
                  style={styles.darkInput}
                  placeholder="Search customer…"
                  value={customerSearch}
                  data-fi="customer"
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerId("");
                    setCustomerDropdownOpen(true);
                  }}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  autoComplete="off"
                />
                {customerDropdownOpen && filteredCustomers.length > 0 && (
                  <div style={styles.dropdown} ref={customerDropRef}>
                    {filteredCustomers.map((c, ci) => (
                      <div
                        key={c.id}
                        style={{ ...styles.dropdownItem, background: ci === customerHighlight ? "var(--bg-hover)" : undefined }}
                        onMouseDown={() => selectCustomer(c)}
                        onMouseEnter={() => setCustomerHighlight(ci)}
                      >
                        {c.name}
                        {c.email && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>{c.email}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {customerDropdownOpen && filteredCustomers.length === 0 && customerSearch && (
                  <div style={styles.dropdown}>
                    <div style={{ padding: "10px 12px", color: "#6b7785", fontSize: 13 }}>
                      No customers found.{" "}
                      <span
                        style={{ color: "var(--primary)", cursor: "pointer" }}
                        onMouseDown={() => navigate("/customers")}
                      >
                        Add one →
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Invoice date */}
            <div>
              <label style={styles.fieldLabel}>Invoice Date</label>
              <input
                type="date"
                style={styles.darkInput}
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
              />
            </div>

            {/* Due date */}
            <div>
              <label style={styles.fieldLabel}>Due Date</label>
              <input
                type="date"
                style={styles.darkInput}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            {/* Reference */}
            <div>
              <label style={styles.fieldLabel}>Reference Number</label>
              <input
                style={styles.darkInput}
                placeholder="Optional reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div style={styles.itemsCard}>
          <table style={{ width: "100%", borderCollapse: "collapse", overflow: "visible" }}>
            <thead>
              <tr style={styles.tableHead}>
                {brands.length > 0 && <th style={{ ...styles.th, width: "15%" }}>Brand</th>}
                <th style={{ ...styles.th, width: brands.length > 0 ? "22%" : "25%" }}>Product</th>
                <th style={{ ...styles.th, width: brands.length > 0 ? "22%" : "28%" }}>Description</th>
                <th style={{ ...styles.th, width: "10%" }}>Qty</th>
                <th style={{ ...styles.th, width: "13%" }}>Rate</th>
                <th style={{ ...styles.th, width: "11%", textAlign: "right" }}>Amount</th>
                <th style={{ ...styles.th, width: "7%", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const amount = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
                const isDropOpen = productDropRow === i;
                const productMatches = isDropOpen
                  ? products.filter((p) => {
                      if (item.brandId && p.brandId !== item.brandId) return false;
                      return item.product.trim() === ""
                        ? true
                        : p.name.toLowerCase().includes(item.product.toLowerCase());
                    })
                  : [];
                return (
                  <tr key={i} style={styles.itemRow}>
                    {/* Brand selector */}
                    {brands.length > 0 && (() => {
                      const isBrandOpen = brandDropRow === i;
                      const selectedBrandName = brands.find((b) => b.id === item.brandId)?.name ?? "";
                      const brandMatches = brands.filter((b) =>
                        brandSearch.trim() === "" ? true : b.name.toLowerCase().includes(brandSearch.toLowerCase())
                      );
                      return (
                        <td style={{ ...styles.td, position: "relative" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                            <input
                              style={{ ...styles.lineInput, borderRadius: "6px 0 0 6px", borderRight: "none", flex: 1 }}
                              placeholder="Brand…"
                              autoComplete="off"
                              data-fi="brand"
                              data-row={i}
                              value={isBrandOpen ? brandSearch : selectedBrandName}
                              onChange={(e) => {
                                setBrandSearch(e.target.value);
                                setBrandDropRow(i);
                              }}
                              onFocus={() => { setBrandDropRow(i); setBrandSearch(""); }}
                              onBlur={() => setTimeout(() => setBrandDropRow(null), 150)}
                            />
                            <button
                              type="button"
                              onMouseDown={() => { setBrandDropRow(isBrandOpen ? null : i); setBrandSearch(""); }}
                              style={{
                                background: "var(--bg)", border: "1px solid var(--border)",
                                borderRadius: "0 6px 6px 0", padding: "8px 10px",
                                cursor: "pointer", color: "var(--muted)", fontSize: 12, lineHeight: 1, flexShrink: 0,
                              }}
                            >▾</button>
                          </div>
                          {isBrandOpen && (
                            <div style={{ ...styles.dropdown, top: "calc(100% + 2px)" }} ref={brandDropRow === i ? brandDropRef : undefined}>
                              {/* Clear option (not keyboard-navigable, index -1) */}
                              <div
                                style={{ ...styles.dropdownItem, color: "var(--muted)", fontStyle: "italic" }}
                                onMouseDown={() => {
                                  updateItem(i, { brandId: "", product: "", description: "", rate: "" });
                                  setBrandDropRow(null);
                                }}
                              >
                                — All brands —
                              </div>
                              {brandMatches.length === 0 ? (
                                <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--muted)" }}>
                                  No brands match &quot;{brandSearch}&quot;
                                </div>
                              ) : (
                                brandMatches.map((b, bi) => (
                                  <div
                                    key={b.id}
                                    style={{
                                      ...styles.dropdownItem,
                                      fontWeight: item.brandId === b.id ? 700 : undefined,
                                      color: item.brandId === b.id ? "var(--primary)" : undefined,
                                      background: bi === brandHighlight ? "var(--bg-hover)" : undefined,
                                    }}
                                    onMouseDown={() => {
                                      updateItem(i, { brandId: b.id, product: "", description: "", rate: "" });
                                      setBrandDropRow(null);
                                    }}
                                    onMouseEnter={() => setBrandHighlight(bi)}
                                  >
                                    {b.name}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })()}
                    <td style={{ ...styles.td, position: "relative" }}>
                      {/* Input + chevron button wrapper */}
                      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                        <input
                          style={{ ...styles.lineInput, borderRadius: "6px 0 0 6px", borderRight: "none", flex: 1 }}
                          placeholder="Search or type product…"
                          value={item.product}
                          autoComplete="off"
                          data-fi="product"
                          data-row={i}
                          onChange={(e) => {
                            updateItem(i, { product: e.target.value });
                            setProductDropRow(i);
                          }}
                          onFocus={() => setProductDropRow(i)}
                          onBlur={() => setTimeout(() => setProductDropRow(null), 150)}
                        />
                        <button
                          type="button"
                          title="Browse products"
                          onMouseDown={() => setProductDropRow(isDropOpen ? null : i)}
                          style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "0 6px 6px 0",
                            padding: "8px 10px",
                            cursor: "pointer",
                            color: "var(--muted)",
                            fontSize: 12,
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          ▾
                        </button>
                      </div>

                      {/* Dropdown */}
                      {isDropOpen && (
                        <div style={{ ...styles.dropdown, top: "calc(100% + 2px)" }} ref={productDropRef}>
                          {products.length === 0 ? (
                            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                              No products yet.{" "}
                              <span
                                style={{ color: "var(--primary)", cursor: "pointer", fontWeight: 600 }}
                                onMouseDown={() => navigate("/products")}
                              >
                                Add from Products page →
                              </span>
                            </div>
                          ) : productMatches.length === 0 ? (
                            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)" }}>
                              No products match &quot;{item.product}&quot;
                            </div>
                          ) : (
                            productMatches.map((p, pi) => (
                              <div
                                key={p.id}
                                style={{ ...styles.dropdownItem, background: pi === productHighlight ? "var(--bg-hover)" : undefined }}
                                onMouseDown={() => {
                                  updateItem(i, {
                                    product: p.name,
                                    description: p.description ?? "",
                                    rate: String(p.unitPrice),
                                  });
                                  setProductDropRow(null);
                                }}
                                onMouseEnter={() => setProductHighlight(pi)}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                                    {p.unit && (
                                      <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>
                                        / {p.unit}
                                      </span>
                                    )}
                                    {p.description && (
                                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                                        {p.description}
                                      </div>
                                    )}
                                  </div>
                                  <span style={{ color: "var(--primary)", fontWeight: 700, fontSize: 14, marginLeft: 12, whiteSpace: "nowrap" }}>
                                    KSh {Number(p.unitPrice).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <input
                        style={styles.lineInput}
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(i, { description: e.target.value })}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        style={styles.lineInput}
                        type="number"
                        min="0"
                        step="any"
                        value={item.qty}
                        onChange={(e) => updateItem(i, { qty: e.target.value })}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        style={styles.lineInput}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={item.rate}
                        data-fi="rate"
                        data-row={i}
                        onChange={(e) => updateItem(i, { rate: e.target.value })}
                      />
                    </td>
                    <td style={{ ...styles.td, textAlign: "right", color: "var(--text)", fontWeight: 500 }}>
                      {amount > 0 ? fmt(amount) : ""}
                    </td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <button
                        type="button"
                        style={styles.removeBtn}
                        onClick={() => removeItem(i)}
                        title="Remove line"
                      >
                        X
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            type="button"
            style={styles.addItemBtn}
            onClick={() => setItems((prev) => [...prev, emptyLine()])}
          >
            + Add Item
          </button>
        </div>

        {/* Bottom: narration + totals */}
        <div style={styles.bottomCard}>
          <div style={{ marginBottom: 20 }}>
            <label style={styles.fieldLabel}>Narration</label>
            <textarea
              style={{ ...styles.darkInput, height: 80, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Narration / Terms / Notes"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
            />
          </div>

          {/* Totals */}
          <div style={styles.totalsBox}>
            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>Subtotal</span>
              <span style={styles.totalValue}>KSh {fmt(subtotal)}</span>
            </div>

            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>
                Discount %{" "}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                  style={styles.pctInput}
                />
              </span>
              <span style={styles.totalValue}>- KSh {fmt(discountAmt)}</span>
            </div>

            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>
                VAT %{" "}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={vatPct}
                  onChange={(e) => setVatPct(parseFloat(e.target.value) || 0)}
                  style={styles.pctInput}
                />
              </span>
              <span style={styles.totalValue}>KSh {fmt(vatAmt)}</span>
            </div>

            <div style={{ width: "100%", height: 1, background: "var(--border)", margin: "8px 0" }} />

            <div style={styles.grandRow}>
              <span>Grand Total</span>
              <span>KSh {fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: "var(--bg)", border: "1px solid var(--danger)", borderRadius: 8, padding: "10px 16px", color: "var(--danger)", fontSize: 14, marginTop: 12 }}>
            {error}
          </div>
        )}

        {/* Save button */}
        <button type="submit" style={{ ...styles.saveBtn, background: saleType === "cash" ? "#16a34a" : "var(--success)" }} disabled={submitting}>
          {submitting ? "Saving…" : saleType === "cash" ? `💵 Record Cash Sale (${paymentMethod})` : "🧾 Save Credit Invoice"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "var(--bg)",
    margin: "-28px",
    padding: "28px 32px",
    minHeight: "calc(100vh - 0px)",
    color: "var(--text)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "var(--text)",
  },
  subtitle: {
    color: "var(--muted)",
    fontSize: 14,
    marginTop: 4,
  },
  topCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "20px 24px",
    marginBottom: 16,
  },
  topGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1.5fr",
    gap: 20,
    alignItems: "end",
  },
  fieldLabel: {
    display: "block",
    fontSize: 12,
    color: "var(--muted)",
    marginBottom: 6,
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  darkInput: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    padding: "9px 12px",
    width: "100%",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  dropdown: {
    position: "absolute" as const,
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    zIndex: 100,
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    maxHeight: 220,
    overflowY: "auto" as const,
  },
  dropdownItem: {
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 14,
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
  },
  itemsCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    marginBottom: 16,
  },
  tableHead: {
    background: "var(--bg-hover, var(--bg))",
  },
  th: {
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--muted)",
    textAlign: "left" as const,
    borderBottom: "1px solid var(--border)",
  },
  itemRow: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "6px 8px",
  },
  lineInput: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    padding: "8px 10px",
    width: "100%",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  removeBtn: {
    background: "var(--danger)",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  addItemBtn: {
    display: "block",
    width: "100%",
    padding: "13px",
    background: "var(--primary)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
  bottomCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "20px 24px",
    marginBottom: 16,
  },
  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 24,
    marginBottom: 20,
  },
  totalsBox: {
    marginLeft: "auto",
    maxWidth: 380,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 14,
    color: "var(--muted)",
  },
  totalLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  totalValue: {
    color: "var(--text)",
    fontWeight: 500,
  },
  pctInput: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text)",
    padding: "3px 8px",
    width: 60,
    fontSize: 13,
    outline: "none",
    textAlign: "center" as const,
  },
  grandRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--primary)",
  },
  saveBtn: {
    display: "block",
    width: "100%",
    padding: "15px",
    background: "var(--success)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.02em",
    marginTop: 8,
  },
  successBox: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "60px 40px",
    textAlign: "center" as const,
    maxWidth: 480,
    margin: "80px auto",
    color: "var(--text)",
  },
  btnGhost: {
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--muted)",
  },
};
