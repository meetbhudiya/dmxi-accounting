import path from "path";
import fs from "fs";
import { exec } from "child_process";

const isPkg = Boolean((process as any).pkg);

if (isPkg) {
  const exeDir = path.dirname(process.execPath);

  const envFile = path.join(exeDir, ".env");
  if (fs.existsSync(envFile)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config({ path: envFile, override: true });
  }

  const dbFile = path.join(exeDir, "dmxi.db").replace(/\\/g, "/");
  process.env.DATABASE_URL = `file:${dbFile}`;

  const engineFile = path.join(exeDir, "query_engine-windows.dll.node");
  if (fs.existsSync(engineFile)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = engineFile;
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("./index");

if (isPkg) {
  const port = Number(process.env.PORT) || 4000;

  const openBrowser = () => {
    exec(`start http://localhost:${port}`, (err) => {
      if (err) exec(`explorer http://localhost:${port}`);
    });
  };
  setTimeout(openBrowser, 1500);

  // Run version check in background after server is up
  setTimeout(() => checkDesktopVersion(), 3000);
}

async function checkDesktopVersion() {
  try {
    const exeDir = path.dirname(process.execPath);

    // Read the version bundled with this exe
    let localVersion = "1.0";
    const localVersionFile = path.join(exeDir, "version.json");
    if (fs.existsSync(localVersionFile)) {
      const v = JSON.parse(fs.readFileSync(localVersionFile, "utf8"));
      localVersion = v.version ?? "1.0";
    }

    // Fetch the remote version manifest
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let remote: any;
    try {
      const res = await fetch("https://dmxiaccounting.com/version.json", {
        signal: controller.signal,
      });
      remote = await res.json();
    } finally {
      clearTimeout(timeout);
    }

    const latestVersion: string = remote.latest ?? localVersion;
    const downloadUrl: string =
      remote.downloadUrl ?? "https://dmxiaccounting.com/#download";
    const changelogUrl: string =
      remote.changelogUrl ?? "https://dmxiaccounting.com/changelog.html";
    const gracePeriodDays: number = Number(remote.gracePeriodDays ?? 30);
    const releaseDate = new Date(remote.releaseDate ?? Date.now());

    if (localVersion === latestVersion) {
      // Up to date — clear any previous block
      (global as any).__dmxi_update = { blocked: false, daysLeft: 999 };
      return;
    }

    // A newer version exists — calculate how many days are left
    const deadline = new Date(
      releaseDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000
    );
    const msLeft = deadline.getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

    (global as any).__dmxi_update = {
      blocked: daysLeft <= 0,
      daysLeft,
      localVersion,
      latestVersion,
      downloadUrl,
      changelogUrl,
      gracePeriodDays,
    };
  } catch {
    // Network unavailable — never block; offline use must always work
  }
}
