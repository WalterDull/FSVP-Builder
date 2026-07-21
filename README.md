# FSVP Builder

A guided web app that walks food importers through building a Foreign
Supplier Verification Program (FSVP) plan — hazard analysis (with a built-in
decision-tree helper), supplier approval, verification activities, a full
SOP library, corrective actions, and reassessment scheduling — and generates
a downloadable `.docx` plan document. A companion tool to FTC
International's PCP Planner, matching its accounts, security, and payment
model.

This guide assumes **zero technical background**. Follow it top to bottom.

---

## What's in this version (v2)

- **Accounts** — each customer signs up with email/password (bcrypt-hashed),
  gets their own dashboard, and can only ever see their own plans.
- **Security** — server-side sessions in Postgres (httpOnly/secure/SameSite
  cookies, not a client-readable token), account lockout after 5 failed
  logins, parameterized SQL everywhere.
- **Paid unlock** — plans are free to draft; downloading the finished Word
  document costs a one-time $699 via Stripe (see `STRIPE_SETUP.md`).
- **Full SOP library** — the same optional SOP set built for the PCP Planner
  (supplier approval, verification activities, label review, import
  receiving & lot traceability, corrective action, recall, plus
  facility-level SOPs for importers who also operate a domestic plant),
  selectable in the wizard and rendered in full in the generated document.
- **Hazard Analysis decision tree** — inline guidance in the wizard, and in
  the generated document, for determining whether a hazard "requires a
  control" and who is responsible for controlling it (the FSVP analog to a
  CCP decision tree).
- **FTC branding** on `fsvp.ftcinternational.com`, matching `pcp.ftcinternational.com`.

---

## Part 1: Put this project's code on GitHub

If you're reading this after I've already pushed the code for you, skip to
Part 2. Otherwise:

```
cd fsvp-builder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/FSVP-Builder.git
git push -u origin main
```

## Part 2: Create a Render account

1. Go to [render.com](https://render.com) and **Sign up with GitHub**.
2. Approve Render's request to access your GitHub account (you can limit it
   to just the `FSVP-Builder` repository).

## Part 3: Deploy with the included Blueprint

This project includes a `render.yaml` that provisions **both** the web
service and its Postgres database together, and wires the connection
automatically — you don't copy-paste a connection string.

1. In the Render dashboard, click **New +** → **Blueprint**.
2. Select the `FSVP-Builder` repository. Render reads `render.yaml` and
   shows you the two resources it will create (`fsvp-builder` web service +
   `fsvp-builder-db` database).
3. Click **Apply**. Wait a few minutes for both to provision and the first
   deploy to finish.
4. Once it says **Live**, open the URL Render gives you
   (`https://fsvp-builder-xxxx.onrender.com`). The database schema is
   created automatically on first boot (see `db/schema.sql` /
   `db/migrate.js` — safe to re-run, uses `IF NOT EXISTS` everywhere).

**Free tier note:** Render's free web service sleeps after inactivity and
takes ~30–50 seconds to wake up; free Postgres databases expire after 30
days of inactivity on the free tier. For anything beyond testing, upgrade
the database to a paid instance ($6–7/mo) so customer accounts don't get
wiped — this is the same tradeoff flagged for PCP-Planner.

## Part 4: Use your own domain

1. Render → your web service → **Settings** → **Custom Domains** → **Add
   Custom Domain** → enter `fsvp.ftcinternational.com`.
2. Render shows you a DNS record (usually a `CNAME`). Add it wherever
   `ftcinternational.com`'s DNS is managed.
3. Wait for Render to show "Verified" (it issues a free SSL certificate
   automatically). `APP_BASE_URL` in `render.yaml` is already set to
   `https://fsvp.ftcinternational.com` — update it if you use a different
   domain.

## Part 5: Set up Stripe payments

See `STRIPE_SETUP.md` in this repo for the full walkthrough (create prices,
get API keys, set environment variables, create a webhook). Until Stripe is
configured, you can test the unlock flow for free by setting
`ALLOW_FREE_UNLOCK=true` in Render's Environment tab — this stops working
automatically the moment `STRIPE_SECRET_KEY` is set, so real payments and
free-unlock testing can never both be active.

---

## How the site is built (for reference)

- **`server.js`** — Express server: security headers, sessions, static
  files, and mounts the auth/plans/billing routers. Runs the DB migration
  automatically on boot.
- **`db/schema.sql` + `db/migrate.js`** — Postgres schema (users, sessions,
  plans, storage subscriptions) and the script that applies it.
- **`routes/auth.js`** — signup/login/logout, bcrypt hashing, lockout.
- **`routes/plans.js`** — create/read/update/delete plans, all scoped to
  `req.session.userId` so one customer can never see another's data (a
  request for someone else's plan ID returns 404, not 403, so it doesn't
  even confirm the ID exists).
- **`routes/billing.js`** — Stripe Checkout session creation, webhook
  handler, and the free-unlock dev override.
- **`lib/generateDocument.js`** — builds the downloadable `.docx`, including
  the hazard-analysis decision tree and the full SOP library content.
- **`public/`** — landing page, login/signup, dashboard, and the 9-step
  wizard.
- **`render.yaml`** — Render Blueprint: web service + Postgres, wired
  together automatically.

To make changes later: clone the repo, edit locally, and push. Every push to
`main` automatically redeploys on Render.

---

## Security summary

- Passwords hashed with bcrypt (cost factor 12); never stored or logged in
  plain text.
- Sessions live server-side in Postgres via `connect-pg-simple`; the cookie
  only holds a signed session ID (httpOnly, `secure` in production,
  `SameSite=lax`).
- Accounts lock for 15 minutes after 5 failed login attempts.
- Every plan query is scoped to the logged-in user's ID; cross-account
  access attempts return 404.
- All SQL uses parameterized queries — no string concatenation into SQL.
- Stripe webhook signatures are verified before any effect is applied.

**Recommended before taking real payments at scale:** email verification /
password reset flow, a Terms of Service and Privacy Policy (have an actual
lawyer draft these, not this tool), and uptime monitoring. These are the
same items flagged for PCP-Planner and haven't been built here yet.

**Testing note:** this code was syntax-checked and the document generator
was smoke-tested end-to-end (a full `.docx` with the decision tree, tables,
and SOP content renders correctly). The account/session/Stripe flows follow
the same pattern already proven live on PCP-Planner, but haven't been
run against a live Postgres instance in this environment — test signup,
login, lockout, and cross-account isolation once deployed, the same way it
was verified for PCP-Planner.

---

## Troubleshooting

- **Render Blueprint fails to apply**: check that both resources
  (`fsvp-builder` and `fsvp-builder-db`) show in the Blueprint preview
  before clicking Apply; if the database name is already taken by another
  Render resource on your account, rename it in `render.yaml`.
- **"WARNING: DATABASE_URL is not set"** in the logs: the Blueprint wires
  this automatically — this warning means the web service was created
  without the Blueprint (e.g., as a plain Web Service). Delete it and
  redeploy via **New +** → **Blueprint** instead.
- **Site loads but wizard doesn't save**: check Render's **Logs** tab for a
  database or session error.
- **Changes on GitHub don't show up on the live site**: check Render's
  **Events** tab — a new deploy should start automatically within a minute
  of your GitHub commit.
