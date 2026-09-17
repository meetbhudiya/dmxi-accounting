const { spawn } = require("child_process");
const path = require("path");

const node = process.execPath;
const viteCli = path.join(__dirname, "node_modules", "vite", "bin", "vite.js");

const proc = spawn(node, [viteCli], {
  cwd: path.join(__dirname, "client"),
  stdio: "inherit",
  windowsHide: true,
});

const kill = () => { try { proc.kill(); } catch (_) {} process.exit(0); };
process.on("SIGTERM", kill);
process.on("SIGINT", kill);
proc.on("exit", (code) => process.exit(code ?? 0));
