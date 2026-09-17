/**
 * Run this ONCE after:
 *   1. You have a Cloudflare account
 *   2. Your domain is on Cloudflare
 *
 * Usage:
 *   node tunnel-setup.js <your-subdomain>
 *
 * Example:
 *   node tunnel-setup.js app.dmxi.co.ke
 *
 * It will:
 *   1. Open your browser to log in to Cloudflare
 *   2. Create a named tunnel called "dmxi"
 *   3. Route your subdomain to the tunnel
 *   4. Write ~/.cloudflared/config.yml
 *   5. Update tunnel-launcher.js to use the permanent tunnel
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs   = require("fs");
const os   = require("os");

const hostname = process.argv[2];
if (!hostname) {
  console.error("Usage: node tunnel-setup.js <subdomain>");
  console.error("Example: node tunnel-setup.js app.dmxi.co.ke");
  process.exit(1);
}

const cf = path.join(__dirname, "cloudflared.exe");
const cfDir = path.join(os.homedir(), ".cloudflared");

function run(args, label) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cf, args, { stdio: "inherit", windowsHide: false });
  if (r.status !== 0) {
    console.error(`✗ Failed (exit ${r.status})`);
    process.exit(1);
  }
  console.log(`✓ Done`);
}

// Step 1: login
run(["tunnel", "login"], "Logging in to Cloudflare (browser will open)...");

// Step 2: create tunnel
run(["tunnel", "create", "dmxi"], "Creating named tunnel 'dmxi'...");

// Step 3: get tunnel ID from credentials file
const credFiles = fs.readdirSync(cfDir).filter(f => f.endsWith(".json") && f !== "cert.pem");
if (credFiles.length === 0) {
  console.error("Could not find tunnel credentials file in ~/.cloudflared/");
  process.exit(1);
}
const credFile = path.join(cfDir, credFiles[credFiles.length - 1]);
const creds    = JSON.parse(fs.readFileSync(credFile, "utf8"));
const tunnelId = creds.TunnelID || creds.tunnelID;
console.log(`\n✓ Tunnel ID: ${tunnelId}`);

// Step 4: route DNS
run(["tunnel", "route", "dns", "dmxi", hostname], `Routing ${hostname} → tunnel...`);

// Step 5: write config.yml
const configPath = path.join(cfDir, "config.yml");
const config = `tunnel: ${tunnelId}
credentials-file: ${credFile.replace(/\\/g, "/")}

ingress:
  - hostname: ${hostname}
    service: http://localhost:5173
  - service: http_status:404
`;
fs.writeFileSync(configPath, config, "utf8");
console.log(`\n✓ Config written to ${configPath}`);

// Step 6: update tunnel-launcher.js to use permanent tunnel
const launcherPath = path.join(__dirname, "tunnel-launcher.js");
const launcher = `/**
 * Cloudflare Permanent Tunnel launcher.
 * Fixed URL: https://${hostname}
 */

const { spawn } = require("child_process");
const path = require("path");

const cloudflared = path.join(__dirname, "cloudflared.exe");

console.log("[tunnel] Starting permanent tunnel...");
console.log("[tunnel] URL: https://${hostname}");

const proc = spawn(cloudflared, ["tunnel", "run", "dmxi"], {
  stdio: "inherit",
  windowsHide: true,
});

const kill = () => { try { proc.kill(); } catch (_) {} process.exit(0); };
process.on("SIGTERM", kill);
process.on("SIGINT",  kill);
proc.on("exit", (code) => process.exit(code ?? 0));
`;
fs.writeFileSync(launcherPath, launcher, "utf8");
console.log(`✓ tunnel-launcher.js updated`);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Setup complete!                                             ║
║                                                              ║
║  Your permanent URL: https://${hostname.padEnd(32)}║
║                                                              ║
║  Start tunnel:  pm2 start ecosystem.config.js --only dmxi-tunnel
║  Stop tunnel:   pm2 stop dmxi-tunnel                         ║
║  Auto-start:    pm2 save                                     ║
╚══════════════════════════════════════════════════════════════╝
`);
