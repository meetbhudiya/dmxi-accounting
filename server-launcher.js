const { spawn, execSync } = require("child_process");
const path = require("path");

// Free port 4000 in case a stale process is holding it
try {
  execSync('for /f "tokens=5" %a in (\'netstat -aon ^| findstr ":4000 " ^| findstr LISTENING\') do taskkill /PID %a /F', { shell: true, stdio: "ignore" });
} catch (_) {}

const node = process.execPath;
const tsxCli = path.join(__dirname, "node_modules", "tsx", "dist", "cli.cjs");

const proc = spawn(node, [tsxCli, "src/index.ts"], {
  cwd: path.join(__dirname, "server"),
  stdio: "inherit",
  windowsHide: true,
});

const kill = () => { try { proc.kill(); } catch (_) {} process.exit(0); };
process.on("SIGTERM", kill);
process.on("SIGINT", kill);
proc.on("exit", (code) => process.exit(code ?? 0));
