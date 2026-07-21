"use strict";

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { generateFsvpDocument } = require("../lib/generateDocument");

const router = express.Router();
router.use(requireAuth);

// POST /api/plans  { data, selectedSops }  -> create a new plan
router.post("/", async (req, res) => {
  try {
    const { data, selectedSops } = req.body || {};
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Missing plan data." });
    }
    const result = await db.query(
      "INSERT INTO plans (user_id, data, selected_sops) VALUES ($1, $2, $3) RETURNING id",
      [req.session.userId, JSON.stringify(data), JSON.stringify(selectedSops || [])]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error("Failed to create plan:", err);
    res.status(500).json({ error: "Could not save plan." });
  }
});

// PUT /api/plans/:id  { data, selectedSops } -> update an existing plan (own plans only)
router.put("/:id", async (req, res) => {
  try {
    const { data, selectedSops } = req.body || {};
    const result = await db.query(
      `UPDATE plans SET data = $1, selected_sops = $2, updated_at = now()
       WHERE id = $3 AND user_id = $4 RETURNING id`,
      [JSON.stringify(data || {}), JSON.stringify(selectedSops || []), req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Plan not found." });
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error("Failed to update plan:", err);
    res.status(500).json({ error: "Could not update plan." });
  }
});

// GET /api/plans -> list current user's plans only. Each plan may now cover
// multiple foreign supplier/food product entries, so the list summarizes
// entry count and supplier names rather than assuming a single supplier.
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, data, unlocked, created_at, updated_at FROM plans
       WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.session.userId]
    );
    res.json(
      result.rows.map((r) => {
        const data = r.data || {};
        // Backward-compatible: legacy plans (pre multi-entry) stored a single
        // supplierName/productName directly on data with no entries[] array.
        const entries = Array.isArray(data.entries) && data.entries.length
          ? data.entries
          : (data.supplierName || data.productName ? [{ supplierName: data.supplierName, productName: data.productName }] : []);
        return {
          id: r.id,
          companyName: data.companyName,
          supplierNames: entries.map((e) => e && e.supplierName).filter(Boolean),
          entryCount: entries.length,
          unlocked: r.unlocked,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      })
    );
  } catch (err) {
    console.error("Failed to list plans:", err);
    res.status(500).json({ error: "Could not load plans." });
  }
});

// Shared "own this plan or 404" loader — a 404 (not 403) on someone else's
// plan avoids confirming the ID exists at all, same as PCP-Planner.
async function loadOwnPlanOr404(req, res) {
  const result = await db.query(
    "SELECT * FROM plans WHERE id = $1 AND user_id = $2",
    [req.params.id, req.session.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Plan not found." });
    return null;
  }
  return result.rows[0];
}

// GET /api/plans/:id
router.get("/:id", async (req, res) => {
  try {
    const plan = await loadOwnPlanOr404(req, res);
    if (!plan) return;
    res.json(plan);
  } catch (err) {
    console.error("Failed to load plan:", err);
    res.status(500).json({ error: "Could not load plan." });
  }
});

// DELETE /api/plans/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await db.query(
      "DELETE FROM plans WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Plan not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete plan:", err);
    res.status(500).json({ error: "Could not delete plan." });
  }
});

// GET /api/plans/:id/download -> generates the .docx, ONLY if unlocked
router.get("/:id/download", async (req, res) => {
  try {
    const plan = await loadOwnPlanOr404(req, res);
    if (!plan) return;
    if (!plan.unlocked) {
      return res.status(402).json({ error: "This plan is locked. Unlock it to download the document." });
    }
    const buffer = await generateFsvpDocument(plan.data, plan.selected_sops || []);
    const safeName = String(plan.data.companyName || "FSVP-Plan").replace(/[^a-z0-9]+/gi, "-");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="FSVP-Plan-${safeName}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error("Failed to generate document:", err);
    res.status(500).json({ error: "Failed to generate document." });
  }
});

module.exports = router;
