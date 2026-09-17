/**
 * Cloudflare Permanent Tunnel launcher.
 * Fixed URL: https://app.dmxiaccounting.com
 */

const { spawn } = require("child_process");
const path = require("path");

const cloudflared = path.join(__dirname, "cloudflared.exe");

console.log("[tunnel] Starting permanent tunnel...");
console.log("[tunnel] URL: https://app.dmxiaccounting.com");

const proc = spawn(cloudflared, ["tunnel", "run", "dmxi"], {
  stdio: "inherit",
  windowsHide: true,
});

const kill = () => { try { proc.kill(); } catch (_) {} process.exit(0); };
process.on("SIGTERM", kill);
process.on("SIGINT",  kill);
proc.on("exit", (code) => process.exit(code ?? 0));
