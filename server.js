const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const connectToDatabase = require("./src/config/db");
const projectRoutes = require("./src/routes/projects");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: process.env.AI_PROVIDER || "mock",
    storage: process.env.STORAGE_MODE || "mongo",
  });
});

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
