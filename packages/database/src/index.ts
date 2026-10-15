import { createBrowserClient, createServerClient } from "@supabase/ssr";
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
