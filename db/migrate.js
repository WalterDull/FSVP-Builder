"use strict";
// Applies db/schema.sql. Safe to run repeatedly (everything is IF NOT EXISTS).
// Runs automatically once on server boot (see server.js) and can also be run
// manually with `npm run migrate`.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./index");

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Database schema is up to date.");
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

module.exports = { migrate };
