import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useCompanyApi } from "../api/useCompanyApi";
import { api, ApiError } from "../api/client";
import type { CompanyRole } from "../api/types";
import { THEMES, applyTheme, getStoredThemeKey, type ThemeKey } from "../lib/theme";
import { getFeatures, setFeature, onFeaturesChanged } from "../lib/features";
import { CURRENCIES, getActiveCurrencyCode, saveCurrency, onCurrencyChanged } from "../lib/currency";
import { PAPER_PRESETS, getStoredPaperSize, savePaperSize, onPaperSizeChanged, type StoredPaperSize } from "../lib/paperSize";

interface Member { id: string; name: string; email: string; role: CompanyRole; }

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: "var(--primary, #2454ff)", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px rgba(36,84,255,0.25)",
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 18px" }}>
      <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0,
        background: on ? "var(--primary, #2454ff)" : "var(--border, #d1d5db)",
        position: "relative", transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 25 : 3,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,.25)", transition: "left 0.2s",
      }} />
    </button>
  );
}

function Toast({ msg }: { msg: { type: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  const ok = msg.type === "ok";
  return (
    <div style={{
      padding: "11px 14px", borderRadius: 8, fontSize: 13,
      background: ok ? "#f0fdf4" : "#fef2f2",
      color:      ok ? "#16a34a" : "#dc2626",
      border:     `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {ok ? "✓" : "✕"} {msg.text}
    </div>
  );
}

// ── Nav tab config ────────────────────────────────────────────────────────────

type Tab = "profile" | "company" | "appearance" | "features" | "sync" | "backups";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "profile",    label: "Profile",    icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={8} r={4}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
  { id: "company",    label: "Company",    icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x={2} y={7} width={20} height={15} rx={2}/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1={12} y1={12} x2={12} y2={16}/><line x1={10} y1={14} x2={14} y2={14}/></svg> },
  { id: "appearance", label: "Appearance", icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> },
  { id: "features",   label: "Features",   icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { id: "sync",       label: "Branch Sync",icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> },
  { id: "backups",    label: "Backups",    icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, currentCompany, refreshCompanies } = useAuth();
  const companyApi = useCompanyApi();

  const [tab, setTab] = useState<Tab>("profile");

  // Profile state
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [currentPw,   setCurrentPw]   = useState("");
  const [newPw,       setNewPw]       = useState("");
  const [confirmPw,   setConfirmPw]   = useState("");
  const [profileMsg,  setProfileMsg]  = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Company / members state
  const [members,          setMembers]          = useState<Member[]>([]);
  const [newCompanyName,   setNewCompanyName]   = useState("");
  const [companyError,     setCompanyError]     = useState<string | null>(null);
  const [companySubmitting,setCompanySubmitting]= useState(false);
  const [companySuccess,   setCompanySuccess]   = useState(false);

  // Rename company state
  const [renameVal,   setRenameVal]   = useState(currentCompany?.name ?? "");
  const [renameBusy,  setRenameBusy]  = useState(false);
  const [renameMsg,   setRenameMsg]   = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Create user state
  const [cuName,     setCuName]     = useState("");
  const [cuEmail,    setCuEmail]    = useState("");
  const [cuPassword, setCuPassword] = useState("");
  const [cuRole,     setCuRole]     = useState<"ADMIN" | "ACCOUNTANT" | "VIEWER">("ACCOUNTANT");
  const [cuError,    setCuError]    = useState<string | null>(null);
  const [cuSuccess,  setCuSuccess]  = useState<string | null>(null);
  const [cuBusy,     setCuBusy]     = useState(false);
  const [showCuPw,   setShowCuPw]   = useState(false);

  // Add existing user state
  const [inviteEmail,   setInviteEmail]   = useState("");
  const [inviteRole,    setInviteRole]    = useState<"ADMIN" | "ACCOUNTANT" | "VIEWER">("ACCOUNTANT");
  const [inviteError,   setInviteError]   = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  // Role-change state
  const [editingRole,   setEditingRole]   = useState<{ id: string; role: string } | null>(null);
  const [roleChangeBusy,setRoleChangeBusy]= useState(false);
  const [removeBusy,    setRemoveBusy]    = useState<string | null>(null);

  // Appearance state
  const [activeTheme,   setActiveTheme]   = useState<ThemeKey>(getStoredThemeKey);
  const [currencyCode,  setCurrencyCode]  = useState(getActiveCurrencyCode);
  const [currencySearch,setCurrencySearch]= useState("");
  const [paperSize,     setPaperSize]     = useState<StoredPaperSize>(getStoredPaperSize);
  const [customW,       setCustomW]       = useState(() => String(getStoredPaperSize().custom?.w ?? 210));
  const [customH,       setCustomH]       = useState(() => String(getStoredPaperSize().custom?.h ?? 297));

  // Features state
  const [features, setFeatureState] = useState(getFeatures);

  // Branch sync state
  const [exporting,    setExporting]    = useState(false);
  const [importing,    setImporting]    = useState(false);
  const [syncMsg,      setSyncMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-sync state
  const [autoConfig, setAutoConfig] = useState<{
    hqUrl: string; hqCompanyId: string; hqEmail: string; hqPasswordSet: boolean;
    intervalMinutes: number; enabled: boolean; lastSyncAt: string | null; lastSyncStatus: string | null;
  } | null>(null);
  const [autoHqUrl,      setAutoHqUrl]      = useState("");
  const [autoHqId,       setAutoHqId]       = useState("");
  const [autoHqEmail,    setAutoHqEmail]    = useState("");
  const [autoHqPassword, setAutoHqPassword] = useState("");
  const [autoInterval,   setAutoInterval]   = useState(60);
  const [autoEnabled,    setAutoEnabled]    = useState(false);
  const [autoSaving,     setAutoSaving]     = useState(false);
  const [autoTriggering, setAutoTriggering] = useState(false);
  const [autoMsg,        setAutoMsg]        = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showAutoHqPw,   setShowAutoHqPw]   = useState(false);

  useEffect(() => onFeaturesChanged(() => setFeatureState(getFeatures())), []);
  useEffect(() => onCurrencyChanged(() => setCurrencyCode(getActiveCurrencyCode())), []);
  useEffect(() => onPaperSizeChanged(() => setPaperSize(getStoredPaperSize())), []);
  useEffect(() => { companyApi.get<Member[]>("/members").then(setMembers).catch(() => null); }, [companyApi]);
  useEffect(() => { if (currentCompany?.name) setRenameVal(currentCompany.name); }, [currentCompany?.name]);

  const canInvite = currentCompany?.role === "OWNER" || currentCompany?.role === "ADMIN";

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    if (newPw && newPw !== confirmPw) { setProfileMsg({ type: "err", text: "New passwords do not match." }); return; }
    setSavingProfile(true);
    try {
      const body: Record<string, string> = {};
      if (profileName && profileName !== user?.name) body.name = profileName;
      if (newPw) { body.currentPassword = currentPw; body.newPassword = newPw; }
      if (!Object.keys(body).length) { setProfileMsg({ type: "ok", text: "Nothing to update." }); return; }
      await api.patch("/auth/me", body);
      setProfileMsg({ type: "ok", text: "Profile updated successfully." });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setProfileMsg({ type: "err", text: err instanceof ApiError ? err.message : "Failed to update profile" });
    } finally { setSavingProfile(false); }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCuError(null); setCuSuccess(null); setCuBusy(true);
    try {
      const m = await companyApi.post<Member>("/members/create-user", { name: cuName, email: cuEmail, password: cuPassword, role: cuRole });
      setMembers((prev) => [...prev, m]);
      setCuName(""); setCuEmail(""); setCuPassword(""); setCuSuccess(`User "${m.name}" created and added as ${m.role}.`);
    } catch (err) { setCuError(err instanceof ApiError ? err.message : "Failed to create user"); }
    finally { setCuBusy(false); }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null); setInviteSuccess(false); setSubmitting(true);
    try {
      await companyApi.post("/members", { email: inviteEmail, role: inviteRole });
      setInviteEmail(""); setInviteSuccess(true);
      setMembers(await companyApi.get<Member[]>("/members"));
    } catch (err) { setInviteError(err instanceof ApiError ? err.message : "Failed to add member"); }
    finally { setSubmitting(false); }
  }

  async function handleRoleChange(userId: string, role: string) {
    setRoleChangeBusy(true);
    try {
      const updated = await companyApi.patch<Member>(`/members/${userId}/role`, { role });
      setMembers((prev) => prev.map((m) => m.id === userId ? updated : m));
      setEditingRole(null);
    } catch (err) { alert(err instanceof ApiError ? err.message : "Failed to update role"); }
    finally { setRoleChangeBusy(false); }
  }

  async function handleRemoveMember(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this company? They will lose access immediately.`)) return;
    setRemoveBusy(userId);
    try {
      await companyApi.del(`/members/${userId}`);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (err) { alert(err instanceof ApiError ? err.message : "Failed to remove member"); }
    finally { setRemoveBusy(null); }
  }

  async function handleRenameCompany(e: FormEvent) {
    e.preventDefault();
    if (!renameVal.trim() || renameVal.trim() === currentCompany?.name) return;
    setRenameMsg(null); setRenameBusy(true);
    try {
      await companyApi.patch("", { name: renameVal.trim() });
      await refreshCompanies();
      setRenameMsg({ type: "ok", text: "Company name updated." });
    } catch (err) {
      setRenameMsg({ type: "err", text: err instanceof ApiError ? err.message : "Failed to rename company" });
    } finally { setRenameBusy(false); }
  }

  async function handleNewCompany(e: FormEvent) {
    e.preventDefault();
    setCompanyError(null); setCompanySuccess(false); setCompanySubmitting(true);
    try {
      await api.post("/companies", { name: newCompanyName });
      setNewCompanyName(""); setCompanySuccess(true);
      await refreshCompanies();
    } catch (err) { setCompanyError(err instanceof ApiError ? err.message : "Failed to create company"); }
    finally { setCompanySubmitting(false); }
  }

  async function handleExport() {
    setExporting(true); setSyncMsg(null);
    try {
      const { blob, filename } = await companyApi.getBlob("/sync/export");
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncMsg({ type: "ok", text: "Bundle exported. Send this file to Head Office." });
    } catch { setSyncMsg({ type: "err", text: "Export failed. Please try again." }); }
    finally { setExporting(false); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setSyncMsg(null); setImportResult(null);
    try {
      const bundle = JSON.parse(await file.text());
      const result = await companyApi.post<any>("/sync/import", bundle);
      setImportResult(result);
      setSyncMsg({ type: "ok", text: `Import from "${result.sourceBranch}" completed.` });
    } catch (err) {
      setSyncMsg({ type: "err", text: err instanceof ApiError ? err.message : "Import failed — make sure the file is a valid .dmxi bundle." });
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  // Load auto-sync config when sync tab is opened
  useEffect(() => {
    if (tab !== "sync") return;
    companyApi.get<any>("/sync/auto-config").then((cfg) => {
      if (!cfg) return;
      setAutoConfig(cfg);
      setAutoHqUrl(cfg.hqUrl ?? "");
      setAutoHqId(cfg.hqCompanyId ?? "");
      setAutoHqEmail(cfg.hqEmail ?? "");
      setAutoInterval(cfg.intervalMinutes ?? 60);
      setAutoEnabled(cfg.enabled ?? false);
    }).catch(() => null);
  }, [tab, companyApi]);

  async function handleAutoSave(e: FormEvent) {
    e.preventDefault();
    setAutoSaving(true); setAutoMsg(null);
    try {
      const body: any = {
        hqUrl: autoHqUrl, hqCompanyId: autoHqId, hqEmail: autoHqEmail,
        intervalMinutes: autoInterval, enabled: autoEnabled,
      };
      if (autoHqPassword) body.hqPassword = autoHqPassword;
      const cfg = await companyApi.patch<any>("/sync/auto-config", body);
      setAutoConfig(cfg);
      setAutoHqPassword("");
      setAutoMsg({ type: "ok", text: autoEnabled ? "Auto-sync enabled. Branch will push to HQ on schedule." : "Settings saved." });
    } catch (err) {
      setAutoMsg({ type: "err", text: err instanceof ApiError ? err.message : "Failed to save settings." });
    } finally { setAutoSaving(false); }
  }

  async function handleAutoTrigger() {
    setAutoTriggering(true); setAutoMsg(null);
    try {
      const result = await companyApi.post<any>("/sync/trigger");
      const ok = result.status === "success";
      setAutoMsg({ type: ok ? "ok" : "err", text: ok ? "Sync successful!" : result.status });
      setAutoConfig((prev) => prev ? { ...prev, lastSyncAt: result.at, lastSyncStatus: result.status } : prev);
    } catch (err) {
      setAutoMsg({ type: "err", text: err instanceof ApiError ? err.message : "Sync failed." });
    } finally { setAutoTriggering(false); }
  }

  // ── Backup state ────────────────────────────────────────────────────────────
  const isDesktop = window.location.hostname === "localhost";
  const [backups,          setBackups]          = useState<any[]>([]);
  const [backupsLoading,   setBackupsLoading]   = useState(false);
  const [backingUp,        setBackingUp]        = useState(false);
  const [backupMsg,        setBackupMsg]        = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmRestore,   setConfirmRestore]   = useState<string | null>(null);
  const [confirmDelete,    setConfirmDelete]    = useState<string | null>(null);
  const [restoring,        setRestoring]        = useState(false);

  useEffect(() => {
    if (tab !== "backups" || !isDesktop) return;
    setBackupsLoading(true);
    fetch("/api/backups", { headers: { Authorization: `Bearer ${localStorage.getItem("dmxi_token")}` } })
      .then(r => r.json()).then(setBackups).catch(() => setBackups([]))
      .finally(() => setBackupsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleBackupNow() {
    setBackingUp(true); setBackupMsg(null);
    try {
      const r = await fetch("/api/backups/now", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("dmxi_token")}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setBackups((prev) => [data, ...prev]);
      setBackupMsg({ type: "ok", text: `Backup created: ${data.filename}` });
    } catch (err: any) { setBackupMsg({ type: "err", text: err.message ?? "Backup failed." }); }
    finally { setBackingUp(false); }
  }

  async function handleDelete(filename: string) {
    try {
      const r = await fetch(`/api/backups/${encodeURIComponent(filename)}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("dmxi_token")}` } });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
      setBackupMsg({ type: "ok", text: `Deleted ${filename}` });
    } catch (err: any) { setBackupMsg({ type: "err", text: err.message ?? "Delete failed." }); }
    finally { setConfirmDelete(null); }
  }

  async function handleRestore(filename: string) {
    setRestoring(true); setBackupMsg(null);
    try {
      const r = await fetch(`/api/backups/${encodeURIComponent(filename)}/restore`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("dmxi_token")}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setBackupMsg({ type: "ok", text: data.message });
    } catch (err: any) { setBackupMsg({ type: "err", text: err.message ?? "Restore failed." }); }
    finally { setRestoring(false); setConfirmRestore(null); }
  }

  function handleOpenFolder() {
    fetch("/api/backups/open-folder", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("dmxi_token")}` } }).catch(() => {});
  }

  function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header banner ────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1829 0%, #162040 100%)",
        borderRadius: 16, padding: "24px 28px 28px",
        marginBottom: 24, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -40, top: -40, width: 220, height: 220, borderRadius: "50%", background: "rgba(36,84,255,0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 60, bottom: -60, width: 160, height: 160, borderRadius: "50%", background: "rgba(36,84,255,0.05)", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, color: "#4a5a72", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
          Account &amp; Preferences
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>Settings</h1>
        <div style={{ fontSize: 13, color: "#4a5a72", marginTop: 5 }}>
          {user?.name} · {user?.email} · <span style={{ color: "#2454ff" }}>{currentCompany?.name}</span>
        </div>
      </div>

      {/* ── Body: sidebar + content ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* Sidebar nav */}
        <div style={{
          width: 200, flexShrink: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: 8, display: "flex", flexDirection: "column", gap: 2,
          position: "sticky", top: 16,
        }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 9, border: "none",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color:      active ? "var(--primary, #2454ff)" : "var(--muted)",
                  background: active ? "rgba(36,84,255,0.08)"   : "transparent",
                  transition: "all 0.14s",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ opacity: active ? 1 : 0.6, flexShrink: 0 }}>{t.icon}</span>
                {t.label}
                {active && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--primary, #2454ff)", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── PROFILE ── */}
          {tab === "profile" && (
            <div className="card" style={{ padding: 28 }}>
              <SectionHeader
                icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={8} r={4}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>}
                title="Profile"
                sub="Your personal account details and password"
              />

              <form onSubmit={handleProfileSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Display Name
                    <input value={profileName} onChange={(e) => setProfileName(e.target.value)} required style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Email <span style={{ fontSize: 10, fontWeight: 500, textTransform: "none" }}>(read-only)</span>
                    <input value={user?.email ?? ""} readOnly style={{ opacity: 0.5, cursor: "not-allowed", fontWeight: 500, textTransform: "none", letterSpacing: 0 }} />
                  </label>
                </div>

                <Divider label="Change Password" />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  {[
                    { label: "Current Password",    value: currentPw,  set: setCurrentPw,  ph: "Current password" },
                    { label: "New Password",         value: newPw,      set: setNewPw,      ph: "Min. 8 characters" },
                    { label: "Confirm New Password", value: confirmPw,  set: setConfirmPw,  ph: "Repeat new password" },
                  ].map(({ label, value, set, ph }) => (
                    <label key={label} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {label}
                      <input type="password" value={value} onChange={(e) => set(e.target.value)} placeholder={ph} style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }} />
                    </label>
                  ))}
                </div>

                <Toast msg={profileMsg} />
                <div>
                  <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ padding: "10px 28px" }}>
                    {savingProfile ? "Saving…" : "Save Profile"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── COMPANY ── */}
          {tab === "company" && (
            <>
              {/* Members table */}
              <div className="card" style={{ padding: 28 }}>
                <SectionHeader
                  icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x={2} y={7} width={20} height={15} rx={2}/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>}
                  title={currentCompany?.name ?? "Company"}
                  sub="Team members, roles, and workspace management"
                />

                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 20, padding: "6px 14px", borderRadius: 8, background: "rgba(36,84,255,0.07)", border: "1px solid rgba(36,84,255,0.15)" }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#2454ff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#2454ff" }}>Your role: {currentCompany?.role}</span>
                </div>

                <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", background: "var(--bg)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Team Members — {members.length}
                  </div>
                  <table style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "10px 16px" }}>Name</th>
                        <th style={{ padding: "10px 16px" }}>Email</th>
                        <th style={{ padding: "10px 16px" }}>Role</th>
                        {canInvite && <th style={{ padding: "10px 16px", width: 160 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => {
                        const isMe = m.id === user?.id;
                        const isOwner = m.role === "OWNER";
                        const editing = editingRole?.id === m.id;
                        return (
                          <tr key={m.id}>
                            <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                              {m.name}
                              {isMe && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: "#2454ff", background: "#eff6ff", padding: "2px 7px", borderRadius: 10 }}>You</span>}
                            </td>
                            <td style={{ padding: "10px 16px", color: "var(--muted)" }}>{m.email}</td>
                            <td style={{ padding: "10px 16px" }}>
                              {canInvite && !isOwner && !isMe && editing ? (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <select
                                    defaultValue={m.role}
                                    onChange={(e) => setEditingRole({ id: m.id, role: e.target.value })}
                                    style={{ fontSize: 12, padding: "4px 8px" }}
                                  >
                                    <option value="VIEWER">Viewer</option>
                                    <option value="ACCOUNTANT">Accountant</option>
                                    <option value="ADMIN">Admin</option>
                                  </select>
                                  <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}
                                    disabled={roleChangeBusy}
                                    onClick={() => handleRoleChange(m.id, editingRole?.role ?? m.role)}>
                                    {roleChangeBusy ? "…" : "Save"}
                                  </button>
                                  <button className="btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setEditingRole(null)}>✕</button>
                                </div>
                              ) : (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                                  background: isOwner ? "#fef3c7" : m.role === "ADMIN" ? "#eff6ff" : m.role === "ACCOUNTANT" ? "#f0fdf4" : "var(--bg)",
                                  color:      isOwner ? "#d97706" : m.role === "ADMIN" ? "#2454ff" : m.role === "ACCOUNTANT" ? "#16a34a" : "var(--muted)",
                                }}>{m.role}</span>
                              )}
                            </td>
                            {canInvite && (
                              <td style={{ padding: "10px 16px" }}>
                                {!isOwner && !isMe && !editing && (
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button className="btn" style={{ fontSize: 11, padding: "4px 10px" }}
                                      onClick={() => setEditingRole({ id: m.id, role: m.role })}>
                                      Change Role
                                    </button>
                                    <button className="btn" style={{ fontSize: 11, padding: "4px 10px", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
                                      disabled={removeBusy === m.id}
                                      onClick={() => handleRemoveMember(m.id, m.name)}>
                                      {removeBusy === m.id ? "…" : "Remove"}
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {members.length === 0 && (
                        <tr><td colSpan={canInvite ? 4 : 3} style={{ padding: 16, color: "var(--muted)", textAlign: "center" }}>No members yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Create new user */}
              {canInvite && (
                <div className="card" style={{ padding: 28 }}>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Create New User</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>Create a brand-new account and automatically add them to this company with the chosen role.</div>
                  </div>

                  <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Full Name *
                        <input value={cuName} onChange={(e) => setCuName(e.target.value)} placeholder="e.g. Jane Doe" required style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Email Address *
                        <input type="email" value={cuEmail} onChange={(e) => setCuEmail(e.target.value)} placeholder="user@example.com" required style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }} />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Temporary Password *
                        <div style={{ position: "relative" }}>
                          <input
                            type={showCuPw ? "text" : "password"}
                            value={cuPassword}
                            onChange={(e) => setCuPassword(e.target.value)}
                            placeholder="Min. 8 characters"
                            required
                            style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, paddingRight: 40 }}
                          />
                          <button type="button" onClick={() => setShowCuPw((v) => !v)}
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, padding: 0 }}>
                            {showCuPw ? "Hide" : "Show"}
                          </button>
                        </div>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Role *
                        <select value={cuRole} onChange={(e) => setCuRole(e.target.value as typeof cuRole)} style={{ fontWeight: 500 }}>
                          <option value="VIEWER">Viewer — read only</option>
                          <option value="ACCOUNTANT">Accountant — create & edit records</option>
                          <option value="ADMIN">Admin — full access except owner actions</option>
                        </select>
                      </label>
                    </div>

                    {/* Role description hint */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      {[
                        { r: "VIEWER",      color: "#64748b", bg: "#f1f5f9", desc: "Can view all records. Cannot create or edit anything." },
                        { r: "ACCOUNTANT",  color: "#16a34a", bg: "#f0fdf4", desc: "Can create invoices, expenses, purchases. Cannot manage users." },
                        { r: "ADMIN",       color: "#2454ff", bg: "#eff6ff", desc: "Full access. Can manage members and all records." },
                      ].map(({ r, color, bg, desc }) => (
                        <div key={r} onClick={() => setCuRole(r as typeof cuRole)} style={{
                          padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                          border: `2px solid ${cuRole === r ? color : "var(--border)"}`,
                          background: cuRole === r ? bg : "var(--bg)",
                          transition: "all 0.12s",
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>{r}</div>
                          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>{desc}</div>
                        </div>
                      ))}
                    </div>

                    {cuError   && <div className="error-text">{cuError}</div>}
                    {cuSuccess && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", fontSize: 13, fontWeight: 600 }}>✓ {cuSuccess}</div>}

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button type="submit" className="btn btn-primary" disabled={cuBusy} style={{ padding: "10px 28px" }}>
                        {cuBusy ? "Creating…" : "Create User & Add to Company"}
                      </button>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>The user can change their password after logging in.</span>
                    </div>
                  </form>
                </div>
              )}

              {/* Add existing user */}
              {canInvite && (
                <div className="card" style={{ padding: 28 }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Add Existing User</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>If someone already has a DMXI account, add them to this company by email.</div>
                  </div>
                  <form onSubmit={handleInvite} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", flex: 1, minWidth: 200 }}>
                      Email address
                      <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="existing@user.com" required style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Role
                      <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)} style={{ fontWeight: 500 }}>
                        <option value="VIEWER">Viewer</option>
                        <option value="ACCOUNTANT">Accountant</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <button type="submit" className="btn" disabled={submitting} style={{ padding: "10px 20px", marginBottom: 1 }}>
                      {submitting ? "Adding…" : "Add to Company"}
                    </button>
                  </form>
                  {inviteError   && <div className="error-text" style={{ marginTop: 8 }}>{inviteError}</div>}
                  {inviteSuccess && <div style={{ color: "#16a34a", fontSize: 13, fontWeight: 600, marginTop: 8 }}>✓ Member added successfully.</div>}
                </div>
              )}

              {/* Rename Company */}
              {canInvite && (
                <div className="card" style={{ padding: 28 }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Company Name</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>This name appears on invoices, quotations, and reports.</div>
                  </div>
                  <form onSubmit={handleRenameCompany} style={{ display: "flex", gap: 10 }}>
                    <input
                      value={renameVal}
                      onChange={(e) => { setRenameVal(e.target.value); setRenameMsg(null); }}
                      placeholder="Company name"
                      required
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn btn-primary" disabled={renameBusy || renameVal.trim() === currentCompany?.name} style={{ whiteSpace: "nowrap" }}>
                      {renameBusy ? "Saving…" : "Save"}
                    </button>
                  </form>
                  {renameMsg && (
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: renameMsg.type === "ok" ? "#16a34a" : "#dc2626" }}>
                      {renameMsg.type === "ok" ? "✓" : "✗"} {renameMsg.text}
                    </div>
                  )}
                </div>
              )}

              {/* New Workspace */}
              <div className="card" style={{ padding: 28 }}>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Create Another Workspace</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Each workspace has its own books, team, and data. Switch between them via the sidebar dropdown.</div>
                </div>
                <form onSubmit={handleNewCompany} style={{ display: "flex", gap: 10 }}>
                  <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company / workspace name" required style={{ flex: 1 }} />
                  <button type="submit" className="btn btn-primary" disabled={companySubmitting} style={{ whiteSpace: "nowrap" }}>
                    {companySubmitting ? "Creating…" : "Create"}
                  </button>
                </form>
                {companyError   && <div className="error-text" style={{ marginTop: 8 }}>{companyError}</div>}
                {companySuccess && <div style={{ color: "#16a34a", fontSize: 13, fontWeight: 600, marginTop: 8 }}>✓ Company created. Use the sidebar dropdown to switch.</div>}
              </div>
            </>
          )}

          {/* ── APPEARANCE ── */}
          {tab === "appearance" && (
            <>
              {/* Theme */}
              <div className="card" style={{ padding: 28 }}>
                <SectionHeader
                  icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}
                  title="App Theme"
                  sub="Choose a colour scheme for the entire app. Changes apply immediately."
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                  {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
                    const theme = THEMES[key];
                    const isActive = activeTheme === key;
                    return (
                      <button
                        key={key}
                        onClick={() => { applyTheme(key); setActiveTheme(key); }}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                          padding: "16px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                          border: isActive ? `2px solid ${theme.preview}` : "2px solid var(--border)",
                          background: isActive ? `${theme.preview}12` : "var(--bg)",
                          transition: "all 0.15s", position: "relative",
                        }}
                      >
                        {isActive && (
                          <span style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: theme.preview }} />
                        )}
                        <div style={{
                          width: 40, height: 40, borderRadius: "50%", background: theme.preview,
                          boxShadow: isActive ? `0 0 0 4px ${theme.preview}35` : "none",
                          transition: "box-shadow 0.15s",
                        }} />
                        <span style={{ fontSize: 12.5, fontWeight: isActive ? 700 : 500, color: "var(--text)" }}>{theme.label}</span>
                        {isActive && <span style={{ fontSize: 10, fontWeight: 700, color: theme.preview, textTransform: "uppercase", letterSpacing: "0.05em" }}>Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Currency */}
              <div className="card" style={{ padding: 28 }}>
                <SectionHeader
                  icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10}/><path d="M16 8h-6a2 2 0 000 4h4a2 2 0 010 4H8M12 6v2M12 16v2"/></svg>}
                  title="Currency"
                  sub="Applied across all amounts, invoices, reports, and exports."
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 440 }}>
                  <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(36,84,255,0.06)", border: "1px solid rgba(36,84,255,0.15)", fontSize: 13 }}>
                    Active: <strong style={{ color: "var(--primary, #2454ff)" }}>
                      {currencyCode} — {CURRENCIES.find((c) => c.code === currencyCode)?.name ?? currencyCode}
                    </strong>
                  </div>
                  <input
                    placeholder="Search currency…"
                    value={currencySearch}
                    onChange={(e) => setCurrencySearch(e.target.value)}
                  />
                  <select
                    value={currencyCode}
                    onChange={(e) => { saveCurrency(e.target.value); setCurrencySearch(""); }}
                    size={8}
                    style={{ borderRadius: 8, border: "1px solid var(--border)", padding: "4px 0", fontSize: 14, background: "var(--bg)" }}
                  >
                    {CURRENCIES
                      .filter((c) => { const q = currencySearch.toLowerCase(); return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q); })
                      .map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* PDF Paper Size */}
              <div className="card" style={{ padding: 28 }}>
                <SectionHeader
                  icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={16} y1={13} x2={8} y2={13}/><line x1={16} y1={17} x2={8} y2={17}/><polyline points="10 9 9 9 8 9"/></svg>}
                  title="PDF Paper Size"
                  sub="Paper size used when exporting invoices, statements, and reports."
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 16 }}>
                  {PAPER_PRESETS.map((p) => {
                    const active = paperSize.key === p.key;
                    return (
                      <button key={p.key} onClick={() => savePaperSize({ key: p.key })} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        padding: "14px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                        border: active ? "2px solid var(--primary)" : "2px solid var(--border)",
                        background: active ? "rgba(36,84,255,0.06)" : "var(--bg)",
                        transition: "all 0.15s",
                      }}>
                        <svg width={28} height={34} viewBox="0 0 28 34" fill="none">
                          <rect x={1} y={1} width={26} height={32} rx={3}
                            fill={active ? "rgba(36,84,255,0.12)" : "var(--surface)"}
                            stroke={active ? "var(--primary)" : "var(--border)"}
                            strokeWidth={1.5} />
                          {[7, 12, 17, 22].map((y) => (
                            <line key={y} x1={5} y1={y} x2={23} y2={y}
                              stroke={active ? "var(--primary)" : "var(--border)"} strokeWidth={1} strokeLinecap="round" />
                          ))}
                        </svg>
                        <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "var(--primary)" : "var(--text)" }}>{p.label}</span>
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>{p.desc}</span>
                        {active && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" }}>Active</span>}
                      </button>
                    );
                  })}

                  {/* Custom */}
                  {(() => {
                    const active = paperSize.key === "custom";
                    return (
                      <button onClick={() => savePaperSize({ key: "custom", custom: { w: Number(customW) || 210, h: Number(customH) || 297 } })} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        padding: "14px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                        border: active ? "2px solid var(--primary)" : "2px solid var(--border)",
                        background: active ? "rgba(36,84,255,0.06)" : "var(--bg)",
                        transition: "all 0.15s",
                      }}>
                        <svg width={28} height={34} viewBox="0 0 28 34" fill="none">
                          <rect x={1} y={1} width={26} height={32} rx={3}
                            fill={active ? "rgba(36,84,255,0.12)" : "var(--surface)"}
                            stroke={active ? "var(--primary)" : "var(--border)"}
                            strokeWidth={1.5} strokeDasharray="3 2" />
                          <text x={14} y={20} textAnchor="middle" fontSize={10} fill={active ? "var(--primary)" : "var(--muted)"} fontFamily="helvetica">?</text>
                        </svg>
                        <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "var(--primary)" : "var(--text)" }}>Custom</span>
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>mm × mm</span>
                        {active && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" }}>Active</span>}
                      </button>
                    );
                  })()}
                </div>

                {paperSize.key === "custom" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                    <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--text)", textTransform: "none", letterSpacing: 0 }}>
                      Width (mm)
                      <input type="number" min={50} max={1000} value={customW}
                        onChange={(e) => setCustomW(e.target.value)}
                        onBlur={() => savePaperSize({ key: "custom", custom: { w: Number(customW) || 210, h: Number(customH) || 297 } })}
                        style={{ width: 80 }} />
                    </label>
                    <span style={{ color: "var(--muted)", fontSize: 18, fontWeight: 300 }}>×</span>
                    <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--text)", textTransform: "none", letterSpacing: 0 }}>
                      Height (mm)
                      <input type="number" min={50} max={1000} value={customH}
                        onChange={(e) => setCustomH(e.target.value)}
                        onBlur={() => savePaperSize({ key: "custom", custom: { w: Number(customW) || 210, h: Number(customH) || 297 } })}
                        style={{ width: 80 }} />
                    </label>
                  </div>
                )}

                <div style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
                  Selected: <strong style={{ color: "var(--text)" }}>
                    {paperSize.key === "custom"
                      ? `Custom — ${paperSize.custom?.w ?? "?"} × ${paperSize.custom?.h ?? "?"} mm`
                      : (() => { const p = PAPER_PRESETS.find((x) => x.key === paperSize.key); return p ? `${p.label} — ${p.desc}` : paperSize.key; })()}
                  </strong>
                </div>
              </div>
            </>
          )}

          {/* ── FEATURES ── */}
          {tab === "features" && (
            <div className="card" style={{ padding: 28 }}>
              <SectionHeader
                icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                title="Features"
                sub="Enable or disable optional modules. Changes reflect immediately in the sidebar."
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {[
                  {
                    key: "quotations" as const,
                    label: "Quotations",
                    desc: "Create and manage customer quotes from the sidebar.",
                    badge: null,
                  },
                  {
                    key: "reconciliation" as const,
                    label: "Reconciliation Engine",
                    desc: "Match bank transactions against ledger entries.",
                    badge: "Coming Soon",
                  },
                  {
                    key: "pos" as const,
                    label: "POS Connectivity",
                    desc: "Connect a Point of Sale terminal. This app acts as back-office.",
                    badge: "Coming Soon",
                  },
                ].map((f, i) => (
                  <div key={f.key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                    padding: "18px 22px",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                    background: "var(--bg)",
                    transition: "background 0.12s",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{f.label}</span>
                        {f.badge && (
                          <span style={{ fontSize: 9, fontWeight: 700, background: "#f59e0b", color: "#fff", borderRadius: 4, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {f.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{f.desc}</div>
                    </div>
                    <Toggle on={features[f.key]} onChange={(v) => setFeature(f.key, v)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BRANCH SYNC ── */}
          {tab === "sync" && (
            <>
              {/* Manual sync */}
              <div className="card" style={{ padding: 28 }}>
                <SectionHeader
                  icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>}
                  title="Branch Sync"
                  sub="Transfer transaction bundles between branches and Head Office."
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                  {[
                    { role: "Branch", color: "#2454ff", bg: "#eff6ff", border: "#bfdbfe", desc: "Export a bundle of all your transactions and send the file to Head Office.", action: "Export Bundle", onClick: handleExport, busy: exporting },
                    { role: "Head Office", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", desc: "Import a bundle received from a branch to merge their data here. Duplicates are skipped.", action: "Import Bundle", onClick: () => fileRef.current?.click(), busy: importing },
                  ].map(({ role, color, bg, border, desc, action, onClick, busy }) => (
                    <div key={role} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{role}</div>
                      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.55 }}>{desc}</div>
                      <button className="btn" onClick={onClick} disabled={busy}
                        style={{ alignSelf: "flex-start", color, borderColor: border, background: "white", fontWeight: 700, fontSize: 13 }}>
                        {busy ? (role === "Branch" ? "Exporting…" : "Importing…") : action}
                      </button>
                    </div>
                  ))}
                </div>

                <input ref={fileRef} type="file" accept=".dmxi,application/json" style={{ display: "none" }} onChange={handleImport} disabled={importing} />
                <Toast msg={syncMsg} />

                {importResult && (
                  <div style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", background: "var(--bg)", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                      Import Summary — {importResult.sourceBranch}
                    </div>
                    <table style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "9px 16px", textAlign: "left" }}>Type</th>
                          <th style={{ padding: "9px 16px", textAlign: "right", color: "#16a34a" }}>Imported</th>
                          <th style={{ padding: "9px 16px", textAlign: "right", color: "var(--muted)" }}>Skipped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(importResult.counts as Record<string, { imported: number; skipped: number }>).map(([type, c]) => (
                          <tr key={type} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 16px", textTransform: "capitalize" }}>{type}</td>
                            <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: c.imported > 0 ? 700 : 400, color: c.imported > 0 ? "#16a34a" : "var(--muted)" }}>{c.imported}</td>
                            <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--muted)" }}>{c.skipped}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Auto sync */}
              {canInvite && (
                <div className="card" style={{ padding: 28 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Auto Sync to Head Office</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Branch server pushes data to HQ automatically on a schedule. No manual file transfers needed.</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: autoEnabled ? "#16a34a" : "var(--muted)" }}>
                        {autoEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <Toggle on={autoEnabled} onChange={setAutoEnabled} />
                    </div>
                  </div>

                  {/* Last sync status */}
                  {autoConfig?.lastSyncAt && (
                    <div style={{
                      padding: "10px 14px", borderRadius: 8, marginBottom: 18, fontSize: 13,
                      background: autoConfig.lastSyncStatus === "success" ? "#f0fdf4" : "#fef2f2",
                      border: `1px solid ${autoConfig.lastSyncStatus === "success" ? "#bbf7d0" : "#fecaca"}`,
                      color: autoConfig.lastSyncStatus === "success" ? "#16a34a" : "#dc2626",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <span>
                        {autoConfig.lastSyncStatus === "success" ? "✓ Last sync succeeded" : `✕ ${autoConfig.lastSyncStatus}`}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>
                        {new Date(autoConfig.lastSyncAt).toLocaleString()}
                      </span>
                    </div>
                  )}

                  <form onSubmit={handleAutoSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        HQ Server URL *
                        <input value={autoHqUrl} onChange={(e) => setAutoHqUrl(e.target.value)} placeholder="https://hq.yourcompany.com" required={autoEnabled} style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        HQ Company ID *
                        <input value={autoHqId} onChange={(e) => setAutoHqId(e.target.value)} placeholder="Paste from HQ Settings → Company" required={autoEnabled} style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }} />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        HQ Login Email *
                        <input type="email" value={autoHqEmail} onChange={(e) => setAutoHqEmail(e.target.value)} placeholder="sync@hq.com" required={autoEnabled} style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        HQ Password {autoConfig?.hqPasswordSet ? "(leave blank to keep current)" : "*"}
                        <div style={{ position: "relative" }}>
                          <input
                            type={showAutoHqPw ? "text" : "password"}
                            value={autoHqPassword}
                            onChange={(e) => setAutoHqPassword(e.target.value)}
                            placeholder={autoConfig?.hqPasswordSet ? "••••••••" : "Password for HQ account"}
                            required={autoEnabled && !autoConfig?.hqPasswordSet}
                            style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, paddingRight: 40 }}
                          />
                          <button type="button" onClick={() => setShowAutoHqPw((v) => !v)}
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, padding: 0 }}>
                            {showAutoHqPw ? "Hide" : "Show"}
                          </button>
                        </div>
                      </label>
                    </div>

                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", maxWidth: 260 }}>
                      Sync Interval
                      <select value={autoInterval} onChange={(e) => setAutoInterval(Number(e.target.value))} style={{ fontWeight: 500 }}>
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every 1 hour</option>
                        <option value={360}>Every 6 hours</option>
                        <option value={720}>Every 12 hours</option>
                        <option value={1440}>Every 24 hours</option>
                      </select>
                    </label>

                    <Toast msg={autoMsg} />

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button type="submit" className="btn btn-primary" disabled={autoSaving} style={{ padding: "10px 24px" }}>
                        {autoSaving ? "Saving…" : "Save Settings"}
                      </button>
                      {autoConfig && (
                        <button type="button" className="btn" disabled={autoTriggering} onClick={handleAutoTrigger} style={{ padding: "10px 20px" }}>
                          {autoTriggering ? "Syncing…" : "Sync Now"}
                        </button>
                      )}
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        The branch server runs this automatically — no browser needs to be open.
                      </span>
                    </div>
                  </form>

                  <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                    <strong style={{ color: "var(--text)", display: "block", marginBottom: 6 }}>How to set this up:</strong>
                    1. At Head Office, go to Settings → Company and copy the <strong>Company ID</strong> from the URL or ask your admin.<br/>
                    2. Create a dedicated sync user at HQ (Accountant role is enough).<br/>
                    3. Enter the HQ server URL, company ID, and that user's credentials here.<br/>
                    4. Enable auto-sync and save — the branch will push to HQ on the chosen schedule.
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "backups" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SectionHeader
                icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                title="Backups"
                sub="Daily automatic backups of your database. Only Admins and Owners can delete or restore."
              />

              {!isDesktop && (
                <div style={{ padding: "16px 18px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)" }}>
                  Backups are only available in the desktop app (DMXI.exe).
                </div>
              )}

              {isDesktop && (
                <>
                  {/* Actions row */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn btn-primary" onClick={handleBackupNow} disabled={backingUp} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      {backingUp ? "Backing up…" : "Backup Now"}
                    </button>
                    <button className="btn" onClick={handleOpenFolder} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                      Open Folder
                    </button>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Auto-backup runs every night at midnight</span>
                  </div>

                  {backupMsg && (
                    <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                      background: backupMsg.type === "ok" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
                      color: backupMsg.type === "ok" ? "#16a34a" : "#dc2626",
                      border: `1px solid ${backupMsg.type === "ok" ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}`,
                    }}>{backupMsg.text}</div>
                  )}

                  {/* Backup list */}
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        {backupsLoading ? "Loading…" : `${backups.length} backup${backups.length !== 1 ? "s" : ""}`}
                      </span>
                    </div>

                    {!backupsLoading && backups.length === 0 && (
                      <div style={{ padding: "32px 18px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
                        No backups yet. Click <strong>Backup Now</strong> to create the first one.
                      </div>
                    )}

                    {backups.map((b) => (
                      <div key={b.filename} style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "12px 18px",
                        borderBottom: "1px solid var(--border)", flexWrap: "wrap",
                      }}>
                        <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                          background: b.isToday ? "rgba(36,84,255,0.1)" : "var(--bg)",
                          border: `1px solid ${b.isToday ? "rgba(36,84,255,0.25)" : "var(--border)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={b.isToday ? "var(--primary,#2454ff)" : "var(--muted)"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                            {b.date}
                            {b.isToday && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "rgba(36,84,255,0.1)", color: "var(--primary,#2454ff)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Today</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{b.filename} · {fmtBytes(b.sizeBytes)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          {confirmRestore === b.filename ? (
                            <>
                              <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>This will overwrite current data.</span>
                              <button className="btn" style={{ color: "#dc2626", borderColor: "#fecaca", fontSize: 12, padding: "5px 12px" }} disabled={restoring}
                                onClick={() => handleRestore(b.filename)}>
                                {restoring ? "Restoring…" : "Confirm Restore"}
                              </button>
                              <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setConfirmRestore(null)}>Cancel</button>
                            </>
                          ) : confirmDelete === b.filename ? (
                            <>
                              <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>Delete permanently?</span>
                              <button className="btn" style={{ color: "#dc2626", borderColor: "#fecaca", fontSize: 12, padding: "5px 12px" }}
                                onClick={() => handleDelete(b.filename)}>
                                Yes, Delete
                              </button>
                              <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setConfirmRestore(b.filename)}>Restore</button>
                              <button className="btn" style={{ color: "#dc2626", borderColor: "#fecaca", fontSize: 12, padding: "5px 12px" }} onClick={() => setConfirmDelete(b.filename)}>Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
                    <strong style={{ color: "var(--text)" }}>Note:</strong> Backups are stored in the <code style={{ background: "var(--border)", padding: "1px 5px", borderRadius: 3 }}>backups/</code> folder beside DMXI.exe.
                    Only Admins and Owners can delete or restore backups. Restore replaces the current database — restart DMXI after restoring.
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
