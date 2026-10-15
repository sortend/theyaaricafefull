import { defineConfig } from "@playwright/test";
// Starts the BUILT customer app with dummy Supabase env. Run `pnpm --filter @yaari/customer build` first.
export default defineConfig({
  testDir: "tests/e2e", reporter: "line",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npx next start -p 3000", cwd: "apps/customer", url: "http://localhost:3000/faq", reuseExistingServer: true, timeout: 60000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test", PAYMENT_WEBHOOK_SECRET: "test-secret", SUPABASE_SERVICE_ROLE_KEY: "test", NOTIFY_SECRET: "s", RESEND_API_KEY: "x", NOTIFY_FROM_EMAIL: "a@b.co" } },
});
