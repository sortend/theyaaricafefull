import { createClient } from "@supabase/supabase-js";
import { mapRazorpayEvent, verifySignature } from "@yaari/validation/src/razorpay";

// Razorpay webhook. This is the ONLY place a payment becomes 'paid'/'failed'/'refunded' — never the browser redirect.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !key) return Response.json({ error: "Payments not configured" }, { status: 503 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-razorpay-signature") ?? "", secret)) return Response.json({ error: "Bad signature" }, { status: 401 });
  const eventId = req.headers.get("x-razorpay-event-id"); if (!eventId) return Response.json({ error: "Missing event id" }, { status: 400 });
  let ev: unknown; try { ev = JSON.parse(raw); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const m = mapRazorpayEvent(ev); if (!m) return Response.json({ ignored: true });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

  if (m.kind === "payment") {
    const { data: p } = await sb.from("payments").select("order_id").eq("provider_ref", m.razorpayOrderId).maybeSingle();
    if (!p) return Response.json({ ignored: "unknown order" }); // 200 so Razorpay stops retrying events that are not ours
    if (m.status === "failed") { // a failed ATTEMPT must never overwrite an order that was later paid
      const { data: o } = await sb.from("orders").select("payment_status").eq("id", p.order_id).single();
      if (o?.payment_status === "paid") return Response.json({ ignored: "already paid" });
    }
    const { data, error } = await sb.rpc("apply_payment_event", { p_event_id: eventId, p_provider: "razorpay", p_ref: m.razorpayOrderId, p_order: p.order_id, p_amount: m.amount, p_status: m.status, p_payload: ev });
    if (error) return Response.json({ error: error.message }, { status: 422 });
    if (m.status === "paid") await sb.from("payments").update({ provider_payment_id: m.paymentId }).eq("provider_ref", m.razorpayOrderId);
    return Response.json({ result: data });
  }
  const { data: p } = await sb.from("payments").select("order_id,provider_ref").eq("provider_payment_id", m.paymentId).maybeSingle();
  if (!p) return Response.json({ ignored: "unknown payment" });
  await sb.from("refunds").update({ status: "processed" }).eq("provider_refund_id", m.refundId);
  const [{ data: rs }, { data: o }] = await Promise.all([sb.from("refunds").select("amount_minor").eq("order_id", p.order_id).eq("status", "processed"), sb.from("orders").select("total_minor").eq("id", p.order_id).single()]);
  const refunded = (rs ?? []).reduce((s, r) => s + r.amount_minor, 0);
  const { data, error } = await sb.rpc("apply_payment_event", { p_event_id: eventId, p_provider: "razorpay", p_ref: p.provider_ref, p_order: p.order_id, p_amount: refunded, p_status: refunded >= (o?.total_minor ?? 0) ? "refunded" : "partially_refunded", p_payload: ev });
  return error ? Response.json({ error: error.message }, { status: 422 }) : Response.json({ result: data });
}
