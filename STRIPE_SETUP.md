# Stripe Setup — FSVP Builder

Same pattern as PCP-Planner. Everything happens in the Stripe dashboard and
Render's Environment tab — no code changes needed, `routes/billing.js` is
already wired up.

## 1. Create a Stripe account
stripe.com → sign up or log in. Turn **Test mode** ON first. Test card:
`4242 4242 4242 4242`, any future expiry, any CVC.

## 2. Create two Prices (Stripe dashboard → Products)

| Product | Type | Suggested price |
|---|---|---|
| "FSVP Plan Unlock" | One-time | **$699 USD** |
| "Extended Storage" (optional) | Recurring — yearly | **$249 USD/yr** |

Copy each **Price ID** (`price_...`).

## 3. Get your Secret key
Developers → API keys → **Secret key** (`sk_test_...`).

## 4. Set Render environment variables
Render dashboard → `fsvp-builder` service → **Environment**:

```
STRIPE_SECRET_KEY = sk_test_...
STRIPE_PRICE_ID_ONE_TIME = price_...              (Plan Unlock)
STRIPE_PRICE_ID_STORAGE_SUBSCRIPTION = price_...  (optional)
APP_BASE_URL = https://fsvp.ftcinternational.com
```

## 5. Create a webhook
Developers → Webhooks → Add endpoint:
- Endpoint URL: `https://fsvp.ftcinternational.com/api/billing/webhook`
- Event: `checkout.session.completed`
- Copy the **Signing secret** (`whsec_...`) → set as `STRIPE_WEBHOOK_SECRET` in Render.

Render auto-redeploys whenever you save an environment variable.

## 6. Test it
Sign up, build a plan, save it, go to your dashboard, click **Unlock This
Plan**, pay with the test card. Confirm the plan shows "Download .docx"
afterward. Check Stripe → Payments for the test charge and Webhooks → your
endpoint for a `200` response.

## 7. Go live
Flip Stripe to **Live mode**, recreate the prices there, swap all Render
values for their live equivalents (`sk_live_...`, live price IDs, new live
`whsec_...`). Set `ALLOW_FREE_UNLOCK` to `false` (or remove it) — the code
already disables free-unlock automatically once `STRIPE_SECRET_KEY` is set,
this just keeps things tidy.

## Safety interlock (already built into `routes/billing.js`)
The moment `STRIPE_SECRET_KEY` is set, `POST /api/billing/dev-unlock/:planId`
refuses every request. Real payments and free-unlock testing mode can never
both be active — same as PCP-Planner.

---

## Pricing & competitive research (why $699)

Based on July 2026 web research: DIY FSVP templates run ~$80–$300; full
FSVP compliance consulting runs $2,000–$10,000/year or $50–$300/hour, or
0.5–5% of imported product value; a dedicated FSVP Agent designation (a
distinct legal role, required only when there's no U.S. owner/consignee at
entry) runs $395–$795; SaaS supplier-risk platforms (FoodDocs, ComplyHub,
Ideagen) run $99–$299+/month, a different recurring-monitoring model.

$699 sits just above PCP-Planner's $599 (same format, slightly higher
because FSVP non-compliance carries a harder failure mode — shipment
detention at the border, not just an inspection finding) and well under the
$2,000+ full-service tier, so it doesn't compete with FTC International's
own consulting work. The $150/hr consulting add-on for edge cases matches
PCP-Planner's rate.

Other services worth adding later: an annual reassessment renewal
subscription (FSVP legally requires reevaluation at least every 3 years —
built-in recurring demand), FSVP Agent designation as a standalone paid
service, and a standalone label-review add-on.
