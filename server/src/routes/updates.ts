import express, { Router } from "express";
import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import { spawn } from "child_process";
import { requireAuth } from "../middleware/auth";

export const updatesRouter = Router();

const isPkg = Boolean((process as any).pkg);
const exeDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, "../../..");
const versionFile = path.join(exeDir, "version.json");

function readLocalVersion(): { version: string; buildDate: string; buildNumber: number } {
  try {
    return JSON.parse(fs.readFileSync(versionFile, "utf8"));
  } catch {
    return { version: "1.0.0", buildDate: "", buildNumber: 1 };
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Fetch plain text, following up to 5 redirects (needed for Google Sheets CSV URL)
function fetchText(url: string, hops = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (hops <= 0) { reject(new Error("Too many redirects")); return; }
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        fetchText(next, hops - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// Parse a single CSV row, respecting double-quoted fields
function parseCsvRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

interface SheetRow {
  version: string;
  buildDate: string;
  downloadUrl: string;
  notes: string;
}

function parseSheet(csv: string): SheetRow | null {
  const lines = csv.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const values  = parseCsvRow(lines[1]);

  const col = (name: string) => values[headers.indexOf(name)] ?? "";

  return {
    version:     col("version"),
    buildDate:   col("builddate"),
    downloadUrl: col("downloadurl"),
    notes:       col("notes"),
  };
}

// ── GET /api/updates/info ─────────────────────────────────────────────────
// Returns this server's own version (public — no auth)
updatesRouter.get("/info", (_req, res) => {
  res.json(readLocalVersion());
});

// ── GET /api/updates/check ────────────────────────────────────────────────
// Fetches the Google Sheet CSV and compares against local version.json
updatesRouter.get("/check", requireAuth, async (_req, res) => {
  const sheetUrl = process.env.VERSION_CHECK_URL?.trim();
  if (!sheetUrl) return res.json({ hasUpdate: false, reason: "VERSION_CHECK_URL not configured" });

  try {
    const csv  = await fetchText(sheetUrl);
    const row  = parseSheet(csv);
    if (!row || !row.version) return res.json({ hasUpdate: false, reason: "Could not parse sheet" });

    const local     = readLocalVersion();
    const hasUpdate = compareVersions(row.version, local.version) > 0;

    res.json({
      hasUpdate,
      currentVersion: local.version,
      latestVersion:  row.version,
      buildDate:      row.buildDate,
      downloadUrl:    row.downloadUrl,
      notes:          row.notes,
    });
  } catch (err: any) {
    res.json({ hasUpdate: false, reason: err.message });
  }
});

// ── POST /api/updates/install ─────────────────────────────────────────────
// Accepts the new DMXI.exe as raw binary, writes swap script, exits.
// Client uploads the file the user downloaded from Google Drive.
updatesRouter.post(
  "/install",
  requireAuth,
  express.raw({ limit: "250mb", type: "*/*" }),
  async (req, res) => {
    if (!isPkg) {
      return res.status(400).json({ error: "Install only works in the packaged exe build" });
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 1024) {
      return res.status(400).json({ error: "No executable data received" });
    }

    const exePath    = path.join(exeDir, "DMXI.exe");
    const tmpPath    = path.join(exeDir, "DMXI-update.exe");
    const scriptPath = path.join(exeDir, "_dmxi_update.bat");

    try {
      fs.writeFileSync(tmpPath, body);

      const bat = [
        "@echo off",
        "timeout /t 3 /nobreak >nul",
        `move /y "${tmpPath}" "${exePath}"`,
        `start "" "${exePath}"`,
        `del "%~f0"`,
      ].join("\r\n");
      fs.writeFileSync(scriptPath, bat, "utf8");

      res.json({ ok: true });

      spawn("cmd.exe", ["/c", scriptPath], {
        detached: true, stdio: "ignore", windowsHide: true,
      }).unref();

      setTimeout(() => process.exit(0), 800);
    } catch (err: any) {
      try { fs.unlinkSync(tmpPath); } catch {}
      res.status(500).json({ error: err.message });
    }
  }
);
