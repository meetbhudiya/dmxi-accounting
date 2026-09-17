import { useEffect, useState } from "react";

const STORAGE_KEY = "dmxi_dismissed_version";
const VERSION_URL = "https://dmxiaccounting.com/version.json";

interface VersionInfo {
  version: string;
  message: string;
  changelogUrl: string;
}

export default function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch(VERSION_URL)
      .then(r => r.json())
      .then((data: VersionInfo) => {
        let dismissed = "";
        try { dismissed = localStorage.getItem(STORAGE_KEY) ?? ""; } catch {}
        if (data.version && data.version !== dismissed) setInfo(data);
      })
      .catch(() => {});
  }, []);

  if (!info) return null;

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, info!.version); } catch {}
    setInfo(null);
  }

  return (
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
        <strong>{info.version} is live</strong> — {info.message}
      </span>
      <a href={info.changelogUrl} target="_blank" rel="noreferrer"
         style={{ color: "#fff", textDecoration: "underline", fontWeight: 600, whiteSpace: "nowrap" }}>
        See what's new →
      </a>
      <button onClick={dismiss} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
