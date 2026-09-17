import { useEffect, useState } from "react";

export default function UpdateOverlay() {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(id);
          window.location.reload();
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(10, 14, 26, 0.97)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20,
    }}>
      {/* Animated ring */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        border: "4px solid #2454ff33",
        borderTop: "4px solid #2454ff",
        animation: "dmxi-spin 0.9s linear infinite",
      }} />

      <style>{`@keyframes dmxi-spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          New version available
        </div>
        <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>
          DMXI has been updated. Reloading in{" "}
          <span style={{ color: "#2454ff", fontWeight: 700 }}>{countdown}s</span>…
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#2454ff", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px 28px",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          Reload now
        </button>
      </div>
    </div>
  );
}
