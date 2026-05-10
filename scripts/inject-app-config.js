#!/usr/bin/env node
/**
 * Writes public/app-config.js for static hosts (e.g. Vercel).
 * Set API_BASE_URL in the deploy environment to your backend (ngrok or permanent API URL).
 * Local `npm run dev` still serves /app-config.js from server.js (route wins over this file).
 */
const fs = require("fs");
const path = require("path");

const apiBaseUrl = String(process.env.API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const target = path.join(__dirname, "..", "public", "app-config.js");
const content = `window.APP_CONFIG = ${JSON.stringify({ apiBaseUrl })};\n`;

fs.writeFileSync(target, content);
process.stdout.write(
  `Wrote ${path.relative(process.cwd(), target)} (${apiBaseUrl ? "apiBaseUrl set" : "apiBaseUrl empty"})\n`
);
