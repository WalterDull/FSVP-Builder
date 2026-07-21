"use strict";

require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const { pool } = require("./db");
const { migrate } = require("./db/migrate");
const authRoutes = require("./routes/auth");
const plansRoutes = require("./routes/plans");
const { router: billingRoutes, webhookRouter: billingWebhookRouter } = require("./routes/billing");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1); // needed on Render so secure cookies work behind its proxy

// Basic security headers. CSP is disabled here to keep setup simple for
// beginners; if you add third-party scripts later, consider configuring a
// Content-Security-Policy explicitly.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

// IMPORTANT: the Stripe webhook needs the raw request body to verify its
// signature. billingWebhookRouter only defines POST /webhook (its own
// express.raw() middleware), and is mounted here — BEFORE the global JSON
// body parser — so Stripe's request never gets JSON-parsed first. The rest
// of the billing routes (checkout, dev-unlock) are mounted further below,
// after express.json(), since they expect a parsed JSON body.
app.use("/api/billing", billingWebhookRouter);

app.use(express.json({ limit: "1mb" }));

// Server-side sessions stored in Postgres (not a client-readable JWT) —
// same approach as PCP-Planner. Requires SESSION_SECRET in production.
app.use(
  session({
    store: new pgSession({ pool, tableName: "session", createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  })
);

// Serve everything in /public as static files (index.html, wizard.html, css, js, images, robots.txt, sitemap.xml)
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// Health check for Render
app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.use("/api/auth", authRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/billing", billingRoutes); // checkout, checkout-storage, dev-unlock (webhook already mounted above, pre-json-parser)

// The wizard and dashboard are gated behind login — same as PCP-Planner,
// which requires an account before letting anyone generate a real plan.
app.get(["/wizard", "/wizard.html"], requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wizard.html"));
});
app.get(["/dashboard", "/dashboard.html"], requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Fallback 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  try {
    await migrate();
  } catch (err) {
    console.error("Could not run database migration at boot:", err.message);
    console.error("Check that DATABASE_URL is set correctly. The server will still start, but auth/plans routes will fail until the database is reachable.");
  }
  app.listen(PORT, () => {
    console.log(`FSVP Builder running on port ${PORT}`);
  });
}

start();
