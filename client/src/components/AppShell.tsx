import { NavLink, Outlet, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { getFeatures, onFeaturesChanged } from "../lib/features";
import { onCurrencyChanged } from "../lib/currency";
import { useVersionCheck } from "../lib/useVersionCheck";
import UpdateOverlay from "./UpdateOverlay";
import UpdateBanner from "./UpdateBanner";
import ShortcutsHelp from "./ShortcutsHelp";
import { ShortcutsContext } from "../contexts/ShortcutsContext";

// ── SVG icon paths (Heroicons outline) ───────────────────────────────────────

const ICON_PATHS: Record<string, string> = {
  dashboard:      "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
  invoices:       "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  quotations:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  customers:      "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  payments:       "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  products:       "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  purchases:      "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  stock:          "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
  stockcount:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  expenses:       "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  vendors:        "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  ledger:         "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  statements:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  reports:        "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  reconciliation: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  settings:       "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  audit:          "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  pos:            "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
};

function NavIcon({ name }: { name: string }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.invoices;
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

// ── Nav data ──────────────────────────────────────────────────────────────────

type NavItem  = { to: string; label: string; icon: string; end?: boolean; soon?: boolean; gKey?: string };
type NavGroup = { label?: string; items: NavItem[] };

function buildGroups(features: ReturnType<typeof getFeatures>): NavGroup[] {
  return [
    {
      items: [
        { to: "/",          label: "Dashboard", icon: "dashboard", end: true, gKey: "D" },
      ],
    },
    {
      label: "Sales",
      items: [
        { to: "/invoices",   label: "Invoices",   icon: "invoices",   gKey: "I" },
        ...(features.quotations ? [{ to: "/quotations", label: "Quotations", icon: "quotations" }] : []),
        { to: "/customers",  label: "Customers",  icon: "customers",  gKey: "U" },
        { to: "/payments",   label: "Payments",   icon: "payments" },
      ],
    },
    {
      label: "Inventory",
      items: [
        { to: "/products",  label: "Products",     icon: "products",  gKey: "O" },
        { to: "/purchases", label: "Purchases",    icon: "purchases", gKey: "P" },
        { to: "/stock",     label: "Stock Report", icon: "stock" },
      ],
    },
    {
      label: "Finance",
      items: [
        { to: "/expenses",   label: "Expenses",   icon: "expenses",  gKey: "E" },
        { to: "/vendors",    label: "Vendors",    icon: "vendors",   gKey: "B" },
        { to: "/ledger",     label: "Ledger",     icon: "ledger",    gKey: "L" },
        ...(features.reconciliation ? [{ to: "/reconciliation", label: "Reconciliation", icon: "reconciliation", soon: true }] : []),
        { to: "/statements", label: "Statements", icon: "statements" },
        { to: "/reports",    label: "Reports",    icon: "reports",   gKey: "R" },
      ],
    },
    {
      label: "System",
      items: [
        { to: "/settings", label: "Settings",    icon: "settings", gKey: "S" },
        { to: "/audit",    label: "Audit Trail", icon: "audit" },
        ...(features.pos ? [{ to: "/pos", label: "POS", icon: "pos", soon: true }] : []),
      ],
    },
  ];
}

// ── Route map for Ctrl+letter navigation ─────────────────────────────────────

const CTRL_ROUTES: Record<string, string> = {
  d: "/",
  i: "/invoices",
  p: "/purchases",
  e: "/expenses",
  u: "/customers",
  b: "/vendors",
  r: "/reports",
  l: "/ledger",
  o: "/products",
  s: "/settings",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const { user, companies, currentCompany, setCurrentCompanyId, logout, loading } = useAuth();
  const [features, setFeatures] = useState(getFeatures);
  const updateAvailable = useVersionCheck();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Close drawer on navigation
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname]);

  // ── Shortcut state ──────────────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false);
  const newActionRef = useRef<(() => void) | null>(null);

  const setNewAction = useCallback((fn: (() => void) | null) => {
    newActionRef.current = fn;
  }, []);

  const ctxValue = useMemo(() => ({ setNewAction }), [setNewAction]);

  // ── Global keyboard listener ────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;

      const key = e.key;

      // Escape: close help if open, otherwise go back
      if (key === "Escape" && !e.ctrlKey && !e.metaKey) {
        if (showHelp) { setShowHelp(false); return; }
        navigate(-1);
        return;
      }

      // Ctrl+/ or Ctrl+? — toggle help
      if ((e.ctrlKey || e.metaKey) && (key === "/" || key === "?")) {
        e.preventDefault();
        setShowHelp((h) => !h);
        return;
      }

      // Ctrl+letter navigation
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const route = CTRL_ROUTES[key.toLowerCase()];
        if (route) {
          e.preventDefault();
          navigate(route);
          return;
        }
      }

      if (inInput) return;

      // ? — toggle help (outside inputs, no modifier)
      if (key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowHelp((h) => !h);
        return;
      }

      // N — new item on current page
      if ((key === "n" || key === "N") && !e.ctrlKey && !e.metaKey) {
        if (newActionRef.current) {
          e.preventDefault();
          newActionRef.current();
        }
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => onFeaturesChanged(() => setFeatures(getFeatures())), []);

  const [, setCurrencyV] = useState(0);
  useEffect(() => onCurrencyChanged(() => setCurrencyV((n) => n + 1)), []);

  const groups = buildGroups(features);

  const initials = (user?.name || user?.email || "?")
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <ShortcutsContext.Provider value={ctxValue}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {updateAvailable && <UpdateOverlay />}
        <ShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />

        {/* ── Mobile top header ─────────────────────────────────────────────── */}
        {isMobile && (
          <header style={{
            position: "fixed", top: 0, left: 0, right: 0, height: 56,
            background: "#0d1117", borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", padding: "0 14px", gap: 12,
            zIndex: 1100,
          }}>
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              style={{ background: "none", border: "none", padding: 6, borderRadius: 7, color: "#c9d4e0", cursor: "pointer", display: "flex", alignItems: "center" }}
              aria-label="Open menu"
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <div style={{
                width: 28, height: 28,
                background: "linear-gradient(135deg, #2454ff 0%, #0f2b99 100%)",
                borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "#fff",
              }}>D</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>DMXI</div>
            </div>
            <div style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>{initials}</div>
          </header>
        )}

        {/* ── Sidebar backdrop (mobile) ─────────────────────────────────────── */}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1150 }}
          />
        )}

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <aside style={{
          width: 232,
          background: "var(--sidebar-bg, #0d1117)",
          color: "var(--sidebar-text, #c9d4e0)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          ...(isMobile ? {
            position: "fixed", top: 0, left: 0, bottom: 0, height: "100vh",
            zIndex: 1200, overflowY: "auto",
            transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          } : {
            position: "sticky", top: 0, height: "100vh", overflowY: "auto",
          }),
        }}>

          {/* Logo */}
          <div style={{ padding: "22px 18px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #2454ff 0%, #0f2b99 100%)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "#fff",
              boxShadow: "0 2px 8px rgb(36 84 255 / 0.4)",
              flexShrink: 0,
            }}>D</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>DMXI</div>
              <div style={{ fontSize: 10, color: "#6b7a90", fontWeight: 500, letterSpacing: "0.04em" }}>ACCOUNTING</div>
            </div>
          </div>

          {/* Company selector */}
          <div style={{ padding: "14px 14px 8px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4a5568", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Company</div>
            <select
              value={currentCompany?.id ?? ""}
              onChange={(e) => setCurrentCompanyId(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.07)",
                color: "#e2eaf4",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, fontSize: 12.5, padding: "7px 10px",
                width: "100%", fontWeight: 500,
              }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id} style={{ background: "#1a2035" }}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Navigation */}
          <nav style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
            {groups.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 4 }}>
                {group.label && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "#3d4f65",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    padding: "10px 8px 4px",
                  }}>{group.label}</div>
                )}
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    style={({ isActive }) => ({
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: 8, textDecoration: "none", gap: 9,
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      color: isActive ? "#fff" : "var(--sidebar-text, #c9d4e0)",
                      background: isActive
                        ? "linear-gradient(135deg, rgba(36,84,255,0.85) 0%, rgba(23,59,204,0.85) 100%)"
                        : "transparent",
                      boxShadow: isActive ? "0 2px 8px rgb(36 84 255 / 0.3)" : "none",
                      transition: "all 0.12s", marginBottom: 1,
                    })}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      if (!el.dataset.active) el.style.background = "rgba(255,255,255,0.07)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      if (!el.dataset.active) el.style.background = "";
                    }}
                  >
                    {({ isActive }) => (
                      <>
                        <span style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
                          <span style={{ opacity: isActive ? 1 : 0.65, flexShrink: 0 }}>
                            <NavIcon name={item.icon} />
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.label}
                            </span>
                            {item.gKey && (
                              <span style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.03em",
                                color: isActive ? "rgba(255,255,255,0.45)" : "#3d4f65",
                                fontFamily: "monospace",
                                marginTop: 1,
                              }}>
                                Ctrl+{item.gKey}
                              </span>
                            )}
                          </span>
                        </span>
                        {item.soon && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                            background: "#f59e0b", color: "#fff",
                            borderRadius: 4, padding: "2px 5px",
                            textTransform: "uppercase", flexShrink: 0,
                          }}>Soon</span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          {/* User section */}
          <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32,
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
              }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#e2eaf4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name || user.email}
                </div>
                <div style={{ fontSize: 11, color: "#4a5568", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentCompany?.role ?? ""}
                </div>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                style={{
                  background: "none", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6, color: "#6b7a90", cursor: "pointer",
                  padding: "5px 8px", fontSize: 11, flexShrink: 0,
                  transition: "color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#6b7a90"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
              >
                Sign&nbsp;out
              </button>
            </div>

            {/* Shortcuts hint */}
            <button
              onClick={() => setShowHelp(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 7, padding: "6px 10px", cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
            >
              <span style={{ fontSize: 11, color: "#4a5568", fontWeight: 500 }}>Keyboard shortcuts</span>
              <kbd style={{
                fontSize: 10, fontWeight: 800,
                background: "rgba(255,255,255,0.08)", color: "#6b7a90",
                border: "1px solid rgba(255,255,255,0.1)", borderBottom: "2px solid rgba(0,0,0,0.3)",
                borderRadius: 4, padding: "1px 6px", fontFamily: "monospace",
              }}>?</kbd>
            </button>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: "100vh", ...(isMobile ? { paddingTop: 56 } : {}) }}>
          <UpdateBanner />
          <div style={{ flex: 1, padding: isMobile ? "20px 16px" : "28px 32px", overflow: "auto" }}>
          {currentCompany ? <Outlet /> : (
            <div className="card" style={{ maxWidth: 400 }}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>No company yet</h2>
              <p className="muted" style={{ fontSize: 13 }}>Create a company from Settings to start using DMXI.</p>
            </div>
          )}
          </div>
        </main>
      </div>
    </ShortcutsContext.Provider>
  );
}
