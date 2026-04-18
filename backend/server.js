require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const authRoutes          = require("./routes/authRoutes");
const marketRoutes        = require("./routes/marketRoutes");
const predictRoutes       = require("./routes/predictRoutes");
const dataRoutes          = require("./routes/dataRoutes");
const locationRoutes      = require("./routes/locationRoutes");
const ragRoutes           = require("./routes/rag");
const newsSentimentRoutes = require("./routes/newsSentiment");
const accuracyRoutes      = require("./routes/accuracyRoutes");
const dashboardRoutes     = require("./routes/dashboardRoutes");
const { startCron }       = require("./utils/cronJob");
const { seed }            = require("./seedMarket");

const app = express();
app.use(cors());
app.use(express.json());

// ── API routes ────────────────────────────────────────────
app.use("/api/auth",      authRoutes);
app.use("/api/market",    marketRoutes);
app.use("/api/location",  locationRoutes);
app.use("/api",           predictRoutes);
app.use("/api",           dataRoutes);
app.use("/api/rag",       ragRoutes);
app.use("/api/news",      newsSentimentRoutes);
app.use("/api/accuracy",  accuracyRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ── Railway health check (no DB, must not block frontend) ─
app.get("/health", (req, res) => res.status(200).send("OK"));

// ── Serve plain HTML frontend ─────────────────────────────
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

const PORT = process.env.PORT || 5001;

// ── Start server first, seed DB in background ─────────────
async function startServer() {
  // Bind to PORT immediately so Railway health check passes
  app.listen(PORT, () =>
    console.log(`🌾  Server ready → http://localhost:${PORT}`)
  );

  // Seed and cron in background — don't block startup
  try {
    console.log("🌱  Seeding fresh market data…");
    await seed();
    startCron();
  } catch (err) {
    console.error("⚠️  Seed failed (server still running):", err.message);
  }
}

startServer();
