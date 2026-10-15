// One-time owner provisioning. Credentials come from the environment — nothing is hardcoded.
// Usage: OWNER_BOOTSTRAP_EMAIL=... OWNER_BOOTSTRAP_PASSWORD=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-owner.mjs
import { createClient } from "@supabase/supabase-js";
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, OWNER_BOOTSTRAP_EMAIL: email, OWNER_BOOTSTRAP_PASSWORD: password } = process.env;
if (!url || !key || !email || !password || password.length < 12) { console.error("Set all env vars; password must be 12+ chars."); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner");
if (count) { console.error("An owner already exists. Refusing to create another."); process.exit(1); }
const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error(error.message); process.exit(1); }
const { error: e2 } = await sb.from("profiles").update({ role: "owner" }).eq("id", data.user.id);
if (e2) { console.error(e2.message); process.exit(1); }
console.log("Owner created:", email);
