import { useEffect, useState } from "react";

const STORAGE_KEY = "dmxi_dismissed_version";
const VERSION_URL = "https://dmxiaccounting.com/version.json";

interface WebVersionInfo {
  latest: string;
  message?: string;
  changelogUrl?: string;
}

interface UpdateStatus {
  blocked: boolean;
  daysLeft: number;
  localVersion?: string;
  latestVersion?: string;
  downloadUrl?: string;
  changelogUrl?: string;
}

export default function UpdateBanner() {
  // Web app: new-version notification (dismissable)
  const [webInfo, setWebInfo] = useState<WebVersionInfo | null>(null);
  // Desktop: deadline countdown (non-dismissable when ≤ 7 days)
  const [desktopStatus, setDesktopStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    // Check website version for the "new release" ribbon
    fetch(VERSION_URL)
      .then(r => r.json())
      .then((data: WebVersionInfo) => {
        let dismissed = "";
        try { dismissed = localStorage.getItem(STORAGE_KEY) ?? ""; } catch {}
        if (data.latest && data.latest !== dismissed) setWebInfo(data);
      })
      .catch(() => {});

    // Check local server for desktop deadline status
    fetch("/api/update-status")
      .then(r => r.json())
      .then((s: UpdateStatus) => {
        // Only show if there's an update with a meaningful deadline
        if (s.latestVersion && s.daysLeft < 999) {
          setDesktopStatus(s);
        }
      })
      .catch(() => {});
  }, []);

  function dismissWeb() {
    try { localStorage.setItem(STORAGE_KEY, webInfo!.latest); } catch {}
    setWebInfo(null);
  }

  const urgency = desktopStatus
    ? desktopStatus.daysLeft <= 7
      ? "critical"
      : desktopStatus.daysLeft <= 14
      ? "warning"
      : "info"
    : "info";

  const canDismissDeadline = desktopStatus ? desktopStatus.daysLeft > 7 : true;

  const [deadlineDismissed, setDeadlineDismissed] = useState(false);

  return (
    <>
      {/* ── Desktop deadline banner ── */}
      {desktopStatus && !deadlineDismissed && (
        <div style={{
          background: urgency === "critical"
            ? "linear-gradient(90deg,#991b1b,#dc2626)"
            : urgency === "warning"
            ? "linear-gradient(90deg,#92400e,#d97706)"
            : "linear-gradient(90deg,#1e3a5f,#2563eb)",
          color: "#fff",
          padding: "9px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 13,
          fontWeight: 500,
          flexWrap: "wrap",
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ flex: 1 }}>
            {desktopStatus.daysLeft <= 0 ? (
              <>
                <strong>Update overdue.</strong> DMXI {desktopStatus.localVersion} will be blocked on next restart — please update now.
              </>
            ) : (
              <>
                <strong>{desktopStatus.daysLeft} day{desktopStatus.daysLeft !== 1 ? "s" : ""} to update.</strong>{" "}
                Version {desktopStatus.latestVersion} is available. After the deadline this version will stop working.
              </>
            )}
          </span>
          <a
            href={desktopStatus.downloadUrl ?? "https://dmxiaccounting.com/#download"}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#fff", textDecoration: "underline", fontWeight: 700, whiteSpace: "nowrap" }}
          >
            Download v{desktopStatus.latestVersion} →
          </a>
          {canDismissDeadline && (
            <button
              onClick={() => setDeadlineDismissed(true)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* ── Web app new-version ribbon ── */}
      {webInfo && !desktopStatus && (
        <div style={{
          background: "linear-gradient(90deg,#0a7c6e,#0abfad)",
          color: "#fff",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 13,
          fontWeight: 500,
          flexWrap: "wrap",
        }}>
          <span style={{ flex: 1 }}>
            <strong>v{webInfo.latest} is live</strong>
            {webInfo.message ? ` — ${webInfo.message}` : ""}
          </span>
          {webInfo.changelogUrl && (
            <a href={webInfo.changelogUrl} target="_blank" rel="noreferrer"
               style={{ color: "#fff", textDecoration: "underline", fontWeight: 600, whiteSpace: "nowrap" }}>
              See what's new →
            </a>
          )}
          <button
            onClick={dismissWeb}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
