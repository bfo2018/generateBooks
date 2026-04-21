const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const connectToDatabase = require("./src/config/db");
const { authRouter } = require("./src/routes/auth");
const projectRoutes = require("./src/routes/projects");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/app-config.js", (_req, res) => {
  const apiBaseUrl = String(process.env.API_BASE_URL || "").trim().replace(/\/+$/, "");

  res.type("application/javascript");
  res.send(`window.APP_CONFIG = ${JSON.stringify({ apiBaseUrl })};`);
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "ai-book-generator",
    provider: process.env.AI_PROVIDER || "mock",
    storage: process.env.STORAGE_MODE || "mongo",
    paymentMode: process.env.PAYMENT_MODE || "demo",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/projects", projectRoutes);

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await connectToDatabase();
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
