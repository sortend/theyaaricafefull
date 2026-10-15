import { createBrowserClient, createServerClient } from "@supabase/ssr";
function need(name: string, v: string | undefined): string {
  if (!v) throw new Error(`Missing ${name}. Add it in Vercel > Project > Settings > Environment Variables, then Redeploy.`);
  return v;
}
// Keep the literal process.env.NEXT_PUBLIC_* references: Next.js inlines them at build time.
const url = () => need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const anon = () => need("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const browserClient = () => createBrowserClient(url(), anon());

type CookieStore = { getAll(): { name: string; value: string }[]; set(name: string, value: string, options?: any): void };
/** Server client acting AS the signed-in user, so RLS and role checks apply. Never uses the service role. */
export function serverClient(store: CookieStore) {
  return createServerClient(url(), anon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => { try { list.forEach((c: { name: string; value: string; options?: any }) => store.set(c.name, c.value, c.options)); } catch { /* read-only context */ } },
    },
  });
}
export { LoginForm } from "./LoginForm";
