import { useState, useEffect, useCallback, useRef } from "react";
import { getToken } from "../api/client";

interface SheetUpdate {
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  buildDate?: string;
  downloadUrl?: string;
  notes?: string;
}

type Stage = "available" | "uploading" | "restarting" | "waiting";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export default function AutoUpdateBanner() {
  const [update, setUpdate]     = useState<SheetUpdate | null>(null);
  const [stage, setStage]       = useState<Stage>("available");
  const [dismissed, setDismissed] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError]       = useState<string | null>(null);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  const check = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch("/api/updates/check", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: SheetUpdate = await res.json();
      if (data.hasUpdate) setUpdate(data);
    } catch {
      // silent — VERSION_CHECK_URL may not be configured
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [check]);

  const pollUntilBack = () => {
    setStage("waiting");
    const poll = async () => {
      try {
        const r = await fetch("/api/health");
        if (r.ok) { window.location.reload(); return; }
      } catch {}
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 5000);
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStage("uploading");
    setUploadPct(0);

    const token = getToken() ?? "";
    const xhr   = new XMLHttpRequest();

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        setStage("restarting");
        pollUntilBack();
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          setError(body.error ?? "Upload failed");
        } catch {
          setError("Upload failed");
        }
        setStage("available");
      }
    };

    xhr.onerror = () => { setError("Network error during upload"); setStage("available"); };

    xhr.open("POST", "/api/updates/install");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(file);
  };

  if (!update?.hasUpdate || dismissed) return null;

  const base: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 9000,
    color: "#fff", fontSize: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
  };

  // ── Available ────────────────────────────────────────────────────────────
  if (stage === "available") {
    return (
      <div style={{ ...base, background: "#1e3a8a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px" }}>
          {/* Update icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>

          <div style={{ flex: 1, minWidth: 0 }}>
            <span>
              <strong>DMXI {update.latestVersion}</strong> is available
              {update.buildDate ? ` · ${update.buildDate}` : ""}.
              {update.notes && (
                <span style={{ color: "#93c5fd", marginLeft: 8 }}>{update.notes}</span>
              )}
            </span>
            <span style={{ color: "#bfdbfe", marginLeft: 12, fontSize: 12 }}>
              You are on v{update.currentVersion}.
            </span>
          </div>

          {/* Step 1 — download from Drive */}
          {update.downloadUrl && (
            <a
              href={update.downloadUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "#fff", color: "#1e3a8a", borderRadius: 6,
                padding: "6px 14px", fontWeight: 700, fontSize: 13,
                textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              1. Download
            </a>
          )}

          {/* Step 2 — pick the downloaded file */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: "#2563eb", color: "#fff", border: "1px solid #93c5fd",
              borderRadius: 6, padding: "6px 14px", fontWeight: 700,
              fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            2. Install file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".exe,application/octet-stream"
            style={{ display: "none" }}
            onChange={onFileSelected}
          />

          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "transparent", color: "rgba(255,255,255,0.55)",
              border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1,
              padding: "0 4px", flexShrink: 0,
            }}
            title="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Instructions sub-bar */}
        <div style={{
          background: "rgba(0,0,0,0.2)", padding: "5px 20px 6px 52px",
          fontSize: 12, color: "#bfdbfe",
        }}>
          {error
            ? <span style={{ color: "#fca5a5" }}>⚠ {error} — please try again.</span>
            : "Click \"1. Download\" to save the new DMXI.exe from Google Drive, then click \"2. Install file…\" and select it — the app will restart automatically."
          }
        </div>
      </div>
    );
  }

  // ── Uploading ────────────────────────────────────────────────────────────
  if (stage === "uploading") {
    return (
      <div style={{ ...base, background: "#7c3aed" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px" }}>
          <Spinner />
          <span style={{ flex: 1 }}>
            Installing DMXI {update.latestVersion}… {uploadPct > 0 ? `${uploadPct}%` : ""}
          </span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Do not close this window</span>
        </div>
        {uploadPct > 0 && (
          <div style={{ height: 3, background: "rgba(255,255,255,0.2)" }}>
            <div style={{ height: "100%", width: `${uploadPct}%`, background: "#a78bfa", transition: "width 0.2s" }} />
          </div>
        )}
      </div>
    );
  }

  // ── Restarting / waiting ─────────────────────────────────────────────────
  return (
    <div style={{ ...base, background: "#065f46" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px" }}>
        <Spinner color="#6ee7b7" />
        <span style={{ flex: 1 }}>
          {stage === "restarting"
            ? "Update installed. Restarting DMXI…"
            : "Waiting for server to come back online…"}
        </span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Do not close this window</span>
      </div>
    </div>
  );
}

function Spinner({ color = "#fff" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
      style={{ animation: "dmxi-spin 0.9s linear infinite", flexShrink: 0 }}>
      <style>{`@keyframes dmxi-spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}
