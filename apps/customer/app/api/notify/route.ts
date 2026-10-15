import { timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

// Target of a Supabase Database Webhook on public.orders (INSERT + UPDATE). Sends email ONLY if Resend is configured.
const MESSAGES: Record<string, string> = { new: "We have received your order", accepted: "The kitchen has accepted your order", ready: "Your order is ready", out_for_delivery: "Your order is on its way", delivered: "Your order was delivered", cancelled: "Your order was cancelled" };

export async function POST(req: Request) {
  const { NOTIFY_SECRET: secret, RESEND_API_KEY: resend, NOTIFY_FROM_EMAIL: from, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!secret || !resend || !from || !key) return Response.json({ error: "Email notifications not configured" }, { status: 503 });
  const a = Buffer.from(req.headers.get("x-notify-secret") ?? ""), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ev = await req.json().catch(() => null);
  const rec = ev?.record; if (!rec?.id || !rec?.customer_id) return Response.json({ error: "Bad payload" }, { status: 400 });
  if (ev.type === "UPDATE" && ev.old_record?.status === rec.status) return Response.json({ skipped: true });
  const text = MESSAGES[rec.status]; if (!text) return Response.json({ skipped: true });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { data: u } = await sb.auth.admin.getUserById(rec.customer_id);
  if (!u?.user?.email) return Response.json({ skipped: "no email" });
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: u.user.email, subject: `The Yaari Café — order #${rec.order_number}`, text: `${text}. Order #${rec.order_number}.` }) });
  return r.ok ? Response.json({ sent: true }) : Response.json({ error: "Email provider rejected the request" }, { status: 502 });
}
