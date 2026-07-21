"use strict";

// Stripe billing — same pattern as PCP-Planner: a one-time "Plan Unlock" price
// gates the .docx export, plus an optional recurring "Extended Storage" price.
// The instant STRIPE_SECRET_KEY is set, the free-unlock dev override below
// stops working — real payments and free-unlock testing mode can never both
// be active.

const express = require("express");
const Stripe = require("stripe");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
// Separate router for the webhook only, so it can be mounted BEFORE the
// global express.json() parser (Stripe's signature check needs the raw,
// unparsed body). Keeping it as its own router — rather than a route
// crammed into the main one — avoids any ambiguity about mount order.
const webhookRouter = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function freeUnlockAllowed() {
  return !process.env.STRIPE_SECRET_KEY && process.env.ALLOW_FREE_UNLOCK === "true";
}

// POST /api/billing/checkout/:planId
router.post("/checkout/:planId", requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(400).json({ error: "Stripe is not configured on this server yet." });

    const planResult = await db.query("SELECT id FROM plans WHERE id = $1 AND user_id = $2", [
      req.params.planId,
      req.session.userId,
    ]);
    if (planResult.rows.length === 0) return res.status(404).json({ error: "Plan not found." });

    const base = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: process.env.STRIPE_PRICE_ID_ONE_TIME, quantity: 1 }],
      customer_email: req.session.email,
      success_url: `${base}/dashboard.html?planId=${req.params.planId}&unlocked=1`,
      cancel_url: `${base}/dashboard.html?planId=${req.params.planId}&unlocked=0`,
      metadata: { planId: String(req.params.planId), userId: String(req.session.userId), product: "fsvp_plan_unlock" },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout session creation failed:", err);
    res.status(500).json({ error: "Could not start checkout." });
  }
});

// POST /api/billing/checkout-storage — optional recurring "Extended Storage" subscription
router.post("/checkout-storage", requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(400).json({ error: "Stripe is not configured on this server yet." });
    if (!process.env.STRIPE_PRICE_ID_STORAGE_SUBSCRIPTION) {
      return res.status(400).json({ error: "Extended Storage is not configured on this server." });
    }
    const base = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID_STORAGE_SUBSCRIPTION, quantity: 1 }],
      customer_email: req.session.email,
      success_url: `${base}/dashboard.html?storage=1`,
      cancel_url: `${base}/dashboard.html?storage=0`,
      metadata: { userId: String(req.session.userId), product: "fsvp_extended_storage" },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Storage checkout session creation failed:", err);
    res.status(500).json({ error: "Could not start checkout." });
  }
});

// POST /api/billing/webhook — Stripe calls this directly. This lives on
// webhookRouter, which server.js mounts at "/api/billing" BEFORE the global
// JSON body parser, so req.body here is the raw Buffer Stripe's SDK needs
// to verify the signature (a JSON-parsed body would fail verification).
webhookRouter.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.status(400).send("Stripe not configured.");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      if (session.metadata?.product === "fsvp_plan_unlock") {
        await db.query(
          `UPDATE plans SET unlocked = TRUE, unlocked_at = now(), stripe_session_id = $1, amount_paid_cents = $2
           WHERE id = $3 AND user_id = $4`,
          [session.id, session.amount_total, session.metadata.planId, session.metadata.userId]
        );
      } else if (session.metadata?.product === "fsvp_extended_storage") {
        await db.query(
          `INSERT INTO storage_subscriptions (user_id, stripe_subscription_id, active_until)
           VALUES ($1, $2, now() + interval '1 year')`,
          [session.metadata.userId, session.subscription]
        );
      }
    } catch (err) {
      console.error("Failed to apply webhook effect:", err);
      // Still return 200 so Stripe doesn't retry indefinitely on a data bug;
      // reconcile manually from Stripe's dashboard if this happens.
    }
  }

  res.json({ received: true });
});

// POST /api/billing/dev-unlock/:planId — free unlock, ONLY while Stripe is not configured.
router.post("/dev-unlock/:planId", requireAuth, async (req, res) => {
  if (!freeUnlockAllowed()) {
    return res.status(403).json({ error: "Free unlock is disabled. Configure Stripe to unlock plans." });
  }
  const result = await db.query(
    `UPDATE plans SET unlocked = TRUE, unlocked_at = now(), dev_unlock = TRUE
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.planId, req.session.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Plan not found." });
  res.json({ unlocked: true, mode: "dev" });
});

module.exports = { router, webhookRouter };
