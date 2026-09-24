import "dotenv/config";
import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { companiesRouter } from "./routes/companies";
import { companyScopedRouter } from "./routes/company-scoped";
import { publicRouter } from "./routes/public";
import { backupRouter } from "./routes/backup";
import { startAutoSync } from "./lib/autoSync";
import { scheduleBackups } from "./lib/backup";

const app = express();

const BUILD_TOKEN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── Desktop update enforcement ───────────────────────────────────────────────
// Only active when running as a packaged exe (isPkg).
// main.ts sets global.__dmxi_update after fetching dmxiaccounting.com/version.json.
// If a newer version exists and the 30-day grace period has expired, every
// non-API browser request is intercepted and shown the update-required page.
const _isPkg = Boolean((process as any).pkg);

app.use((req, res, next) => {
  if (!_isPkg) return next();
  const update = (global as any).__dmxi_update;
  if (!update?.blocked) return next();
  // Let API calls through so the page can still render its own content
  if (req.path.startsWith("/api/")) return next();
  res.status(200).send(buildUpdatePage(update));
});

function buildUpdatePage(update: {
  daysLeft: number;
  localVersion: string;
  latestVersion: string;
  downloadUrl: string;
  changelogUrl: string;
  gracePeriodDays: number;
}) {
  const overdue = Math.abs(update.daysLeft);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Update Required — DMXI Accounting</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#0D1220;color:#E2E7F0;font-family:'IBM Plex Sans',system-ui,sans-serif;
  font-size:15px;line-height:1.6;padding:24px;}
.card{background:#151E2E;border:1px solid #222C3E;border-radius:16px;
  padding:52px 44px;max-width:520px;width:100%;text-align:center;
  box-shadow:0 8px 40px rgba(0,0,0,0.4);}
.icon{width:64px;height:64px;border-radius:50%;background:rgba(220,38,38,0.12);
  display:flex;align-items:center;justify-content:center;margin:0 auto 28px;}
.icon svg{width:28px;height:28px;color:#F87171;}
h1{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:600;
  letter-spacing:-0.02em;margin:0 0 12px;color:#F1F5F9;}
.sub{color:#7B8BA8;font-size:14.5px;line-height:1.75;margin:0 0 32px;}
.meta{display:flex;gap:24px;justify-content:center;margin-bottom:32px;flex-wrap:wrap;}
.meta-item{text-align:center;}
.meta-val{font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:500;
  color:#F87171;display:block;line-height:1;}
.meta-lbl{font-size:11px;color:#5F6B84;text-transform:uppercase;letter-spacing:0.08em;margin-top:5px;}
.btn{display:inline-flex;align-items:center;gap:8px;background:#0ABFAD;color:#fff;
  padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;
  text-decoration:none;transition:background 0.15s;}
.btn:hover{background:#088B7D;}
.links{margin-top:20px;display:flex;gap:20px;justify-content:center;flex-wrap:wrap;}
.links a{font-size:13px;color:#5F6B84;text-decoration:none;}
.links a:hover{color:#A8B4CC;}
.badge{display:inline-block;background:rgba(220,38,38,0.12);color:#F87171;
  font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;
  letter-spacing:0.1em;text-transform:uppercase;padding:3px 10px;border-radius:4px;margin-bottom:20px;}
</style></head><body>
<div class="card">
  <div class="icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  </div>
  <span class="badge">Update Required</span>
  <h1>Your DMXI is out of date</h1>
  <p class="sub">Version <strong>${update.latestVersion}</strong> was released and the
    ${update.gracePeriodDays}-day update window has closed.
    DMXI ${update.localVersion} can no longer be used until you update.</p>
  <div class="meta">
    <div class="meta-item">
      <span class="meta-val">${update.localVersion}</span>
      <div class="meta-lbl">Your version</div>
    </div>
    <div class="meta-item">
      <span class="meta-val">${update.latestVersion}</span>
      <div class="meta-lbl">Latest version</div>
    </div>
    <div class="meta-item">
      <span class="meta-val">${overdue}d</span>
      <div class="meta-lbl">Past deadline</div>
    </div>
  </div>
  <a href="${update.downloadUrl}" class="btn">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download v${update.latestVersion}
  </a>
  <div class="links">
    <a href="${update.changelogUrl}" target="_blank">What's new →</a>
    <a href="https://dmxiaccounting.com" target="_blank">dmxiaccounting.com</a>
  </div>
</div>
</body></html>`;
}

app.use(cors());
app.use(express.json({ limit: "70mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "DMXI" });
});

app.get("/api/version", (_req, res) => {
  res.json({ token: BUILD_TOKEN });
});

// Returns update state so the React UI can show a warning banner
app.get("/api/update-status", (_req, res) => {
  const update = (global as any).__dmxi_update ?? { blocked: false, daysLeft: 999 };
  res.json(update);
});

app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/companies/:companyId", companyScopedRouter);
app.use("/api/backups", backupRouter);
app.use("/api", publicRouter);

// Serve the React client in production (when client/dist exists beside the server)
const isPkg = Boolean((process as any).pkg);
const clientDist = isPkg
  ? path.join(path.dirname(process.execPath), "public")
  : path.join(__dirname, "../../client/dist");

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API route returns index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err?.message ?? "Internal server error";
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`DMXI server listening on http://localhost:${port}`);
  startAutoSync().catch(console.error);
  scheduleBackups();
});
