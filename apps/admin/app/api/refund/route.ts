import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { serverClient } from "@yaari/database";

// Owner-only refund. Money moves at Razorpay; the order's refunded status is set later by the verified webhook.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const orderId = body?.orderId, amt = body?.amountMinor;
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/.test(orderId) || (amt !== undefined && (!Number.isInteger(amt) || amt <= 0))) return Response.json({ error: "Invalid request" }, { status: 400 });
  const sb = serverClient(cookies());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret, SUPABASE_SERVICE_ROLE_KEY: svc } = process.env;
  if (!id || !secret || !svc) return Response.json({ error: "Refunds are not configured" }, { status: 503 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, svc, { auth: { persistSession: false } });
  const { data: pay } = await admin.from("payments").select("provider_payment_id,amount_minor").eq("order_id", orderId).in("status", ["paid", "partially_refunded"]).not("provider_payment_id", "is", null).maybeSingle();
  if (!pay) return Response.json({ error: "No captured payment for this order" }, { status: 404 });
  const { data: prior } = await admin.from("refunds").select("amount_minor").eq("order_id", orderId).in("status", ["pending", "processed"]);
  const remaining = pay.amount_minor - (prior ?? []).reduce((s, r) => s + r.amount_minor, 0);
  const amount = amt ?? remaining;
  if (amount <= 0 || amount > remaining) return Response.json({ error: `Refundable amount left: ${remaining}` }, { status: 422 });
  const r = await fetch(`https://api.razorpay.com/v1/payments/${pay.provider_payment_id}/refund`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") }, body: JSON.stringify({ amount, notes: { yaari_order_id: orderId } }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.id) return Response.json({ error: j?.error?.description ?? "Payment provider rejected the refund" }, { status: 502 });
  await admin.from("refunds").insert({ order_id: orderId, provider_refund_id: j.id, amount_minor: amount, created_by: user.id });
  await admin.from("audit_logs").insert({ actor: user.id, action: "refund_initiated", entity: "order", entity_id: orderId, detail: { amount, refund: j.id } });
  return Response.json({ refundId: j.id, amount });
}
