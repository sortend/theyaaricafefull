# The Yaari Café — complete setup, from creating the Supabase project to going live

Dashboard labels change occasionally; if a menu name differs slightly, look for the closest match.
Use TWO Supabase projects: `yaari-dev` (testing) and `yaari-prod` (real customers). Repeat Parts 1-6 for each.

## Part 0 — Install on your computer
Node.js 20+, Git, pnpm (`npm i -g pnpm@9`), Supabase CLI (a global `npm i -g supabase` is not supported by Supabase, so run every CLI command below as `npx supabase ...`, or install it with Homebrew on macOS / Scoop on Windows). Unzip the project, open a terminal inside `the-yaari-cafe`, run `pnpm install`.

## Part 1 — Create the Supabase project
1. supabase.com > Sign up (GitHub or email) > New organization.
2. New project: name `yaari-prod`, generate and SAVE a strong database password, region **Mumbai (ap-south-1)**.
3. Plan: Free is fine for testing (it pauses after about a week of inactivity and has no backups). Use a paid plan for the live café.
4. Wait until the project finishes provisioning.

## Part 2 — Copy your keys
Project Settings > API (or "API Keys"): copy **Project URL**, the **anon / publishable key** (safe for browsers) and the **service_role / secret key** (SERVER ONLY: never in browser code, never in git, never in chat).

## Part 3 — Put the keys in each app (local)
Create `apps/<app>/.env.local` for each app:
| App | Variables |
|---|---|
| customer | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_CAFE_ADDRESS, NEXT_PUBLIC_CONTACT_PHONE, NEXT_PUBLIC_CONTACT_EMAIL (+ optional NOTIFY_SECRET, RESEND_API_KEY, NOTIFY_FROM_EMAIL) |
| admin | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET |
| kitchen | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY |
| delivery | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY |

## Part 4 — Create the database tables
```
npx supabase login
npx supabase init            # accept defaults; keeps the existing supabase/migrations folder
npx supabase link --project-ref <ref>     # ref = the part before .supabase.co in your Project URL
npx supabase db push         # applies migrations 0001-0009
```
Do NOT run `supabase/seed.sql` on yaari-prod (it is demo data for local testing only).
If `db push` fails on the `storage.objects` policy in migration 0005, run just that statement in Dashboard > SQL Editor, then re-run `npx supabase db push`.
Check Dashboard > Table Editor: you should see profiles, orders, menu_items, item_options, ingredients, recipes, reservations, payments, refunds, audit_logs, etc. with RLS enabled.

## Part 5 — Authentication
1. Authentication > URL Configuration: Site URL = your customer URL. Add Redirect URLs: all four production URLs plus `http://localhost:3000`, `:3001`, `:3002`, `:3003`.
2. Authentication > Providers > Email: enabled, **Confirm email ON**.
3. Authentication > SMTP: add a custom SMTP provider before launch. The built-in sender is heavily rate-limited and not meant for production.
4. Authentication > Rate limits: keep the defaults unless you have a reason.

## Part 6 — Realtime and Storage
1. Database > Publications > `supabase_realtime`: confirm `orders` and `delivery_assignments` are listed (the migrations add them).
2. Storage: bucket `gallery` exists (migration 0005). Upload JPG/PNG/WebP photos; they appear on the customer Gallery page.

## Part 7 — Create the owner account (one time)
bash/macOS/Linux:
```
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OWNER_BOOTSTRAP_EMAIL=you@example.com OWNER_BOOTSTRAP_PASSWORD='a-long-password-12+' pnpm create-owner
```
Windows PowerShell: set each with `$env:NAME="value"` first, then `pnpm create-owner`.
The script refuses to run if an owner already exists. Never create owners any other way.

## Part 8 — First data (admin app, `pnpm dev`, http://localhost:3003)
1. Sign in as the owner.
2. **Categories** > add Coffee, Food, etc.
3. **Menu** > add items (choose a category), then Publish.
4. **Options** > sizes and add-ons per item. **Inventory** > ingredients and stock. **Recipes** > what each item uses (stock is deducted when the kitchen accepts an order).
5. Settings with no screen yet: Dashboard > Table Editor > `settings`:
   `tax_bps` (500 = 5%; set the rate your accountant advises), `delivery_fee_minor` (4000 = 40.00), `cod_enabled` (true/false), `max_covers_per_slot` (reservation capacity per 2-hour window).
6. Staff: they register on the customer site, then Admin > Staff > assign Kitchen or Delivery.

## Part 9 — Run everything locally
`pnpm dev` starts customer :3000, delivery :3001, kitchen :3002, admin :3003. Run the manual lifecycle:
customer places an order > kitchen accepts/prepares/ready > admin assigns delivery > rider accepts, picks up, delivers (cash orders: "Cash collected") > customer sees live status. Also test: reservation, customer cancel, sold-out item.

## Part 10 — Razorpay (India)
1. razorpay.com > sign up; stay in **Test mode** (keys `rzp_test_...`). Live mode needs business KYC approval.
2. Settings > API Keys > generate; Settings > Payment Capture > automatic.
3. Settings > Webhooks > Add: URL `https://<customer-domain>/api/webhooks/payment` (for local testing use an HTTPS tunnel), choose a secret, events **payment.captured, payment.failed, refund.processed**. Put the same secret in `RAZORPAY_WEBHOOK_SECRET`.
4. Test with Razorpay's test cards/UPI. The order must turn `paid` only after the webhook arrives. Then test an Admin refund.

## Part 11 — Deploy (four hosting projects)
1. Push the repo to GitHub (`git init`, commit, push). `.env*` files are git-ignored.
2. Vercel > Add New Project > import the repo, four times. Root Directory: `apps/customer`, `apps/delivery`, `apps/kitchen`, `apps/admin`. Enable "Include source files outside of the Root Directory". Add each app's env vars from Part 3 (use the PRODUCTION Supabase and, at first, Razorpay test keys).
3. Domains: add `www`, `delivery`, `kitchen`, `admin` under each project's Settings > Domains and create the DNS records Vercel shows at your domain registrar. HTTPS is automatic.
4. Go back to Supabase Auth URL Configuration and confirm the production URLs; update the Razorpay webhook URL to the production domain.
5. Re-run Part 9 on production with test payments.

## Part 12 — Go-live checklist
- Razorpay live keys (after KYC) in the customer and admin apps; live webhook with a new secret.
- Custom SMTP working (sign-up emails arrive).
- Supabase Dashboard > Advisors (security): no warnings you do not understand. RLS is enabled on every table.
- Paid plan with backups enabled.
- Privacy and Terms pages reviewed by a legal professional; contact variables filled.
- Rotate any key that was ever shared or committed.
- One real low-value live payment and refund to confirm the whole chain.

## Troubleshooting
- Login works but pages say "not authenticated": check Redirect URLs and that the app env uses the same project as the keys.
- Kitchen board does not update live: check Part 6 publication; the 15-second polling fallback still refreshes.
- Webhook returns 401: secret mismatch, or a proxy altered the body. 503: env vars missing. Orders stay pending: the webhook is not reaching the customer app.
- `db push` error on migrations: send the exact error text.

## Appendix — Setting up WITHOUT installing anything (browser only)
Possible, with these trade-offs: you cannot test locally, and errors show up only in the Vercel/Supabase logs.
1. Part 1 and 2 as written (all in the browser).
2. Instead of Part 4: Dashboard > SQL Editor > New query > paste the contents of `supabase/all_migrations.sql` > Run. (If it is too large or errors, run the files `supabase/migrations/0001...` to `0009...` one at a time, in order. If only the storage policy in 0005 fails, run the rest and that statement separately.) Never run `seed.sql`.
3. Part 5 and 6 are dashboard-only; do them as written.
4. Instead of Part 7 (owner script): Authentication > Users > Add user > Create new user (tick auto-confirm), then SQL Editor: `update profiles set role = 'owner' where id = '<that user id>';`. Do this once, for yourself only.
5. Parts 8 and 10 work in the browser. For Part 11, upload the project to GitHub through the website (it accepts about 100 files per upload, so upload folder by folder), then import it in Vercel. Put the env vars in Vercel's Settings > Environment Variables instead of `.env.local` files.
6. If you later start using the CLI, it will not know these migrations were applied; mark them with `npx supabase migration repair` or just keep using the SQL Editor.
