"use strict";

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  // Fail loudly at boot rather than mysteriously later — same philosophy as
  // PCP-Planner's approach to missing DB config.
  console.warn(
    "WARNING: DATABASE_URL is not set. FSVP Builder requires Postgres for " +
      "accounts and saved plans. Set DATABASE_URL in your environment (Render " +
      "provides this automatically when you deploy the included render.yaml " +
      "Blueprint, which provisions a database alongside the web service)."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
