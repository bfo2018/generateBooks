#!/usr/bin/env node
"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mode = process.argv[2] === "docker" ? "docker" : "local";
const tunnelPort =
  mode === "docker"
    ? String(process.env.BOOKFORGE_HOST_PORT || "3010")
    : String(process.env.PORT || "3000");

function findNgrokBin(rootDir) {
  const local = path.join(rootDir, "node_modules", ".bin", "ngrok");
  if (fs.existsSync(local)) {
    return local;
  }
  return "ngrok";
}

function fetchTunnelsBody() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: 4040,
        path: "/api/tunnels",
        timeout: 2000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", () => resolve(""));
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
  });
}

async function waitForPublicUrl(deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const raw = await fetchTunnelsBody();
    try {
      const parsed = JSON.parse(raw);
      const tunnels = parsed.tunnels || [];
      const httpsTunnel = tunnels.find((t) => t.proto === "https");
      const pick = httpsTunnel || tunnels[0];
      if (pick && pick.public_url) {
        return pick.public_url;
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 450));
  }
  return "";
}

async function main() {
  const rootDir = path.join(__dirname, "..");
  const ngrokBin = findNgrokBin(rootDir);

  const child = spawn(ngrokBin, ["http", tunnelPort], {
    cwd: rootDir,
    stdio: ["ignore", "inherit", "inherit"],
  });

  const shutdown = () => {
    try {
      child.kill("SIGTERM");
    } catch (_e) {
      /* ignore */
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  child.on("error", (err) => {
    console.error(`Failed to start ngrok (${ngrokBin}): ${err.message}`);
    console.error('Install CLI: https://ngrok.com/download or run: npm install');
    process.exit(1);
  });

  const url = await waitForPublicUrl(35000);

  console.log("");
  if (url) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Public URL (open this in your browser):");
    console.log(`    ${url}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } else {
    console.warn("Could not read the tunnel URL from ngrok yet.");
    console.warn("Inspect tunnels at: http://127.0.0.1:4040");
  }
  console.log("");
  console.log("Tip: Same-origin ngrok keeps API calls working (leave API_BASE_URL empty).");
  console.log(`Tunneling localhost:${tunnelPort} (mode=${mode})`);
  console.log("Press Ctrl+C to stop ngrok.");

  await new Promise((resolve) => {
    child.on("exit", resolve);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
