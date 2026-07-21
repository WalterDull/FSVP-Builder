"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 10;

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongEnough(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!isStrongEnough(password)) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );

    req.session.userId = result.rows[0].id;
    req.session.email = result.rows[0].email;
    res.status(201).json({ id: result.rows[0].id, email: result.rows[0].email });
  } catch (err) {
    console.error("Signup failed:", err);
    res.status(500).json({ error: "Could not create your account. Please try again." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const result = await db.query(
      "SELECT id, email, password_hash, failed_logins, locked_until FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];

    // Same response whether the account exists or not, to avoid leaking
    // which emails are registered.
    const genericError = { error: "Incorrect email or password." };

    if (!user) return res.status(401).json(genericError);

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({ error: `Account temporarily locked. Try again in ${minutesLeft} minute(s).` });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const failedLogins = user.failed_logins + 1;
      const lockedUntil =
        failedLogins >= LOCKOUT_THRESHOLD
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : null;
      await db.query(
        "UPDATE users SET failed_logins = $1, locked_until = $2 WHERE id = $3",
        [lockedUntil ? 0 : failedLogins, lockedUntil, user.id]
      );
      if (lockedUntil) {
        return res.status(423).json({ error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` });
      }
      return res.status(401).json(genericError);
    }

    await db.query("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [user.id]);

    req.session.userId = user.id;
    req.session.email = user.email;
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: "Could not log in. Please try again." });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "Not logged in." });
  res.json({ id: req.session.userId, email: req.session.email });
});

module.exports = router;
