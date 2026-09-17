import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password, companyName);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      background: "linear-gradient(135deg, #0d1117 0%, #0f1d38 50%, #0d1117 100%)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Decorative blobs */}
      <div style={{ position: "absolute", top: -120, right: -80, width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(36,84,255,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -100, left: -60, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(23,59,204,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Left panel – branding */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 64px",
        color: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
          <div style={{
            width: 40, height: 40,
            background: "linear-gradient(135deg, #2454ff 0%, #0f2b99 100%)",
            borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800,
            boxShadow: "0 4px 16px rgb(36 84 255 / 0.45)",
          }}>D</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>DMXI</div>
            <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 600, letterSpacing: "0.06em" }}>ACCOUNTING</div>
          </div>
        </div>

        <h1 style={{ margin: "0 0 16px", fontSize: 38, fontWeight: 800, letterSpacing: "-0.8px", lineHeight: 1.15, color: "#fff" }}>
          Smart accounting<br />for growing businesses
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: "#6b7a90", lineHeight: 1.7, maxWidth: 400 }}>
          Invoicing, expenses, purchases, reports — all in one place. Built for teams that move fast.
        </p>

        <div style={{ display: "flex", gap: 24, marginTop: 48 }}>
          {[
            { value: "100%", label: "Cloud-based" },
            { value: "Real-time", label: "Reports" },
            { value: "Multi-user", label: "Access control" },
          ].map((stat) => (
            <div key={stat.label}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#2454ff" }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 600, marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel – form */}
      <div style={{
        width: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 32px",
        flexShrink: 0,
      }}>
        <div style={{
          width: "100%",
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          padding: "36px 32px",
          boxShadow: "0 32px 64px rgb(0 0 0 / 0.4)",
        }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" }}>
            {mode === "login" ? "Welcome back" : "Get started"}
          </h2>
          <p style={{ margin: "0 0 28px", fontSize: 13, color: "#6b7a90" }}>
            {mode === "login" ? "Sign in to your workspace" : "Create your account and company"}
          </p>

          <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleSubmit}>
            {mode === "register" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Your name</div>
                <input
                  value={name} onChange={(e) => setName(e.target.value)} required
                  placeholder="Full name"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: 9, fontSize: 13.5 }}
                />
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Email</div>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="you@company.com"
                style={{ background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: 9, fontSize: 13.5 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Password</div>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                minLength={mode === "register" ? 8 : undefined} required
                placeholder={mode === "register" ? "Min. 8 characters" : "••••••••"}
                style={{ background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: 9, fontSize: 13.5 }}
              />
            </div>
            {mode === "register" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Company name</div>
                <input
                  value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
                  placeholder="Your company"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: 9, fontSize: 13.5 }}
                />
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(214,51,76,0.15)", border: "1px solid rgba(214,51,76,0.4)", color: "#ff8096", borderRadius: 8, padding: "9px 12px", fontSize: 12.5 }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={submitting}
              style={{
                marginTop: 4,
                width: "100%",
                padding: "11px",
                background: "linear-gradient(135deg, #2454ff 0%, #173bcc 100%)",
                border: "none",
                borderRadius: 9,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.65 : 1,
                boxShadow: "0 4px 16px rgb(36 84 255 / 0.45)",
                transition: "opacity 0.15s, box-shadow 0.15s",
                letterSpacing: "-0.01em",
              }}
            >
              {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div style={{ marginTop: 20, fontSize: 12.5, color: "#4a5568", textAlign: "center" }}>
            {mode === "login" ? (
              <span>
                New to DMXI?{" "}
                <a href="#" style={{ color: "#5b8cff", fontWeight: 600, textDecoration: "none" }}
                  onClick={(e) => { e.preventDefault(); setMode("register"); setError(null); }}>
                  Create an account
                </a>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <a href="#" style={{ color: "#5b8cff", fontWeight: 600, textDecoration: "none" }}
                  onClick={(e) => { e.preventDefault(); setMode("login"); setError(null); }}>
                  Sign in
                </a>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
