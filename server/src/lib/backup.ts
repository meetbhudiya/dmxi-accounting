import fs from "fs";
import path from "path";
import { exec } from "child_process";
import AdmZip from "adm-zip";

const isPkg = Boolean((process as any).pkg);

function getBackupDir(): string {
  const base = isPkg ? path.dirname(process.execPath) : path.join(__dirname, "../../../");
  const dir = path.join(base, "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDbPath(): string {
  if (isPkg) return path.join(path.dirname(process.execPath), "dmxi.db");
  return path.join(__dirname, "../../../dmxi.db");
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface BackupEntry {
  filename: string;
  date: string;
  sizeBytes: number;
  createdAt: string;
  isToday: boolean;
}

export function listBackups(): BackupEntry[] {
  const dir = getBackupDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".zip")).sort().reverse();
  const today = todayStr();
  return files.map((filename) => {
    const stat = fs.statSync(path.join(dir, filename));
    // filename format: dmxi-backup-YYYY-MM-DD.zip  or  dmxi-backup-YYYY-MM-DD-HHmmss.zip
    const match = filename.match(/dmxi-backup-(\d{4}-\d{2}-\d{2})/);
    const date = match ? match[1] : "unknown";
    return {
      filename,
      date,
      sizeBytes: stat.size,
      createdAt: stat.birthtime.toISOString(),
      isToday: date === today,
    };
  });
}

export async function runBackup(): Promise<BackupEntry> {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) throw new Error("Database file not found — nothing to back up.");

  const dir = getBackupDir();
  const ts = new Date().toISOString().replace(/T/, "-").replace(/:/g, "").slice(0, 17);
  const filename = `dmxi-backup-${ts}.zip`;
  const zipPath = path.join(dir, filename);

  const zip = new AdmZip();
  zip.addLocalFile(dbPath);
  zip.writeZip(zipPath);

  const stat = fs.statSync(zipPath);
  const match = filename.match(/dmxi-backup-(\d{4}-\d{2}-\d{2})/);
  return {
    filename,
    date: match ? match[1] : todayStr(),
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
    isToday: true,
  };
}

export function deleteBackup(filename: string): void {
  // Validate filename to prevent path traversal
  if (!/^dmxi-backup-[\d\-]+\.zip$/.test(filename)) {
    throw new Error("Invalid backup filename.");
  }
  const filePath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(filePath)) throw new Error("Backup file not found.");
  fs.unlinkSync(filePath);
}

export function restoreBackup(filename: string): void {
  if (!/^dmxi-backup-[\d\-]+\.zip$/.test(filename)) {
    throw new Error("Invalid backup filename.");
  }
  const filePath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(filePath)) throw new Error("Backup file not found.");

  const dbPath = getDbPath();
  const zip = new AdmZip(filePath);
  const entry = zip.getEntries().find((e) => e.entryName === "dmxi.db");
  if (!entry) throw new Error("Backup does not contain a dmxi.db file.");

  // Write the restored database (overwrites the current one)
  fs.writeFileSync(dbPath, zip.readFile(entry)!);
}

export function openBackupsFolder(): void {
  const dir = getBackupDir();
  exec(`explorer "${dir}"`);
}

// ── Midnight scheduler ────────────────────────────────────────────────────────
// Runs once at midnight every day. Uses a recursive setTimeout aligned to the
// next midnight rather than node-cron, so it works inside the pkg bundle.

export function scheduleBackups(): void {
  if (!isPkg) return; // desktop-only

  function msUntilMidnight(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0); // next midnight
    return next.getTime() - now.getTime();
  }

  function scheduleNext() {
    setTimeout(async () => {
      try {
        await runBackup();
        console.log(`[backup] Auto-backup complete: ${todayStr()}`);
      } catch (err) {
        console.error("[backup] Auto-backup failed:", err);
      }
      scheduleNext(); // schedule the next midnight run
    }, msUntilMidnight());
  }

  scheduleNext();
  console.log(`[backup] Daily backup scheduled — next run in ${Math.round(msUntilMidnight() / 60000)} min`);
}
