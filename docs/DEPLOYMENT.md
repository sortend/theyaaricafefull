# Deployment (The Yaari Café)

Nothing here has been deployed yet. Steps to do it:

1. **Supabase**: create a project; `supabase link`; `supabase db push` (applies migrations 0001-0004). Do NOT run `seed.sql` in production.
   Auth > URL config: add all four production URLs as redirect URLs. Enable email confirmation.
2. **Owner**: from a trusted machine run `pnpm create-owner` with `OWNER_BOOTSTRAP_EMAIL`, `OWNER_BOOTSTRAP_PASSWORD` (12+ chars), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Staff then register on the customer site and the owner assigns roles in Admin > Staff.
3. **Hosting** (Vercel shown; any Next.js host works): create FOUR projects from this repo, each with Root Directory `apps/customer|delivery|kitchen|admin`, install command `pnpm install`, build command `pnpm build`. Enable "include files outside root directory".
4. **Env vars** (see `.env.example`): all apps need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Only the customer app (webhook route) needs `SUPABASE_SERVICE_ROLE_KEY` and `PAYMENT_WEBHOOK_SECRET`. Customer also takes the contact variables.
5. **DNS/HTTPS**: CNAME `www`, `delivery`, `kitchen`, `admin` to the host; certificates are issued automatically.
6. **Payments**: choose the gateway for the operating country, map its webhook header and payload to `paymentEventSchema` in `apps/customer/app/api/webhooks/payment/route.ts`, register `https://www.<domain>/api/webhooks/payment` with the gateway, and test in sandbox first. Checkout does not yet start a payment, so orders stay `pending`.
7. **Tests**: `pnpm test` (unit). Integration: see header of `tests/integration/order_flow.test.sql`.
