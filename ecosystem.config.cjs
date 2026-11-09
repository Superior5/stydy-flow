const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");

// Read afresh on each start/restart of this ecosystem file.
const env = dotenv.parse(fs.readFileSync(path.join(__dirname, ".env")));
module.exports = {
  apps: [
    {
      name: "studyflow",
      cwd: path.join(__dirname, "back"),
      script: "dist/server.js",
      interpreter: process.execPath,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      min_uptime: "10s",
      max_restarts: 10,
      kill_timeout: 30000,
      time: true,
      env: {
        ...env,
        NODE_ENV: "production",
        PORT: env.PORT || "3007",
      },
    },
  ],
};
