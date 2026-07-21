"use strict";

// Requires an authenticated session. Same pattern as PCP-Planner: session
// data lives server-side (Postgres via connect-pg-simple), the cookie only
// holds a signed session id, and there is no way for a client to forge
// req.session.userId.
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Please log in." });
    }
    return res.redirect("/login.html");
  }
  next();
}

module.exports = { requireAuth };
