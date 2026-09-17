const path = require("path");
const root = __dirname;

module.exports = {
  apps: [
    {
      name: "dmxi-server",
      script: path.join(root, "server-launcher.js"),
      cwd: root,
      env: { NODE_ENV: "development" },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "dmxi-client",
      script: path.join(root, "client-launcher.js"),
      cwd: root,
      env: { NODE_ENV: "development" },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      // Start with: pm2 start ecosystem.config.js --only dmxi-tunnel
      // Stop  with: pm2 stop dmxi-tunnel
      // Check URL:  pm2 logs dmxi-tunnel --lines 30
      name: "dmxi-tunnel",
      script: path.join(root, "tunnel-launcher.js"),
      cwd: root,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
      // Does NOT start automatically with "pm2 start ecosystem.config.js"
      // because you only need it when you want remote/cellular access
    },
  ],
};
