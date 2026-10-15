# The Yaari Café — monorepo (foundation stage)

## Done (written, NOT yet installed/built/tested)
- pnpm + Turborepo workspace, four Next.js app shells (customer/delivery/kitchen/admin, ports 3000-3003)
- `@yaari/validation`: Zod checkout schema + role transition map
- `supabase/migrations/0001_core.sql`: core schema, RLS on all tables, no self-promotion on profiles,
  server-side pricing (`place_order`), role-gated transitions (`transition_order`), webhook idempotency table
- Local-only seed

## Added in pass 2 (also untested)
- `@yaari/database` (user-scoped Supabase clients, LoginForm), customer sign-in/menu/cart/`/api/checkout` (calls `place_order`), kitchen board with realtime + 15s polling fallback calling `transition_order`

## Added in pass 3 (untested)
- Migration 0002: `assign_delivery`, `respond_assignment`, idempotent `apply_payment_event` (service-role only, amount check), audit entries
- Delivery app (own assignments only, accept/reject, directions, call, picked-up/delivered) and Owner admin (orders, delivery assignment, cancel, verified-revenue view, sold-out toggle)
- Premium customer UI + rename to The Yaari Café

## Added in pass 4 (untested)
- Migration 0003: reservations with capacity check + advisory lock, owner confirm/reject/reschedule, customer cancel, `cancel_my_order` (only while new and unpaid)
- Customer `/orders` live tracking and `/reserve`; admin `/reservations`
- `/api/webhooks/payment`: HMAC-verified, zod-validated, idempotent via `apply_payment_event` (generic shape; map to the chosen gateway)
- `pnpm create-owner`: one-time owner provisioning from env vars (refuses if an owner exists)

## Added in pass 5 (untested)
- Migration 0004: `set_staff_role` (owner only; not self, not owners), ingredients + `adjust_stock` (reason required, history kept)
- Admin menu CRUD, staff roles, inventory, shared nav; customer about/FAQ/contact/privacy/terms (legal text is a draft)

## Verification so far
- `pnpm install` OK; unit tests (validation) 7/7 passed; `tsc --noEmit` run on all four apps (see latest status in chat)
- SQL integration test written (`tests/integration/order_flow.test.sql`) but NOT yet run
- Deployment steps: `docs/DEPLOYMENT.md` (nothing deployed)

## Added in pass 6
- 3D hero (React Three Fiber cup, lazy-loaded, off on mobile/reduced-motion), menu search + category filter + item detail, gallery from Supabase Storage bucket `gallery` (owner uploads via dashboard)
- Migration 0005: recipes + one-time stock deduction on kitchen accept; admin Recipes page
- `/api/notify` email via Resend (needs a Database Webhook on orders INSERT/UPDATE with header x-notify-secret; returns 503 until configured)

## Added in pass 7
- Migration 0006: customers can edit own name/phone (column grants still block role changes) — bug found while writing profile page
- Customer `/profile`, `/order/success`, `/order/failed`
- SQL integration test now RUN on real Postgres 16 via `python tests/integration/run_local.py` (uses a small Supabase shim, not full Supabase): migrations 0001-0006 + seed apply cleanly; order-flow assertions pass (server totals, no self-promotion, kitchen/customer transition limits, idempotent payments, amount mismatch)

## Added in pass 8
- Migration 0007: sizes/add-ons (`item_options`), server-side pricing via `item_unit_price`, option snapshot on order lines; customer menu option pickers + cart lines; kitchen shows options; admin Options page
- Customer fonts now bundled via Fontsource (no Google Fonts at build) -> production build succeeds offline
- Playwright API-level e2e (`pnpm --filter @yaari/customer build && pnpm test:e2e`): 6/6 pass against the built customer app. Browser (UI) e2e NOT written/run: Chromium could not be downloaded in the build sandbox
- SQL test extended with variant assertions; passes

## Added in pass 9 (India / Razorpay)
- Migration 0008 (refunds, provider_payment_id); `/api/pay` starts Razorpay checkout; webhook verifies `x-razorpay-signature` and is the only thing that sets paid/failed/refunded; owner-only `/api/refund` (admin); success page confirms payment via webhook, never the redirect; setup: docs/SUPABASE_SETUP.md. NOT yet tested against live Razorpay test mode.

## Added in pass 10
- Migration 0009: cash on delivery (`payment_method`, `record_cash_payment` for owner or the assigned rider only); admin Categories screen + category pickers in Menu; delivery app shows cash due; kitchen shows method
- 6 browser UI tests written (`pnpm test:ui`, need Chromium) — NOT run here; API e2e 7/7 pass; SQL cash assertions pass
- Full setup guide: docs/SUPABASE_SETUP.md

## Not done yet
Customer UI/3D/animation, cart, checkout route, auth screens, kitchen realtime board, delivery flow,
admin CRUD/analytics, inventory, reservations, payment provider + webhook handler, refunds, notifications,
audit triggers, tests, deployment. Payment provider depends on the operating country (not yet chosen).

## Run
cp .env.example .env.local; pnpm install; supabase start; supabase db reset; pnpm dev
First owner: one-time provisioning script using OWNER_BOOTSTRAP_EMAIL (not yet written).
