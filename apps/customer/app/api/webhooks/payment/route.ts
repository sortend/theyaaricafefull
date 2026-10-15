import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { paymentEventSchema } from "@yaari/validation";

// Generic HMAC-SHA256 verification. When the gateway is chosen, map its header name and payload to paymentEventSchema here.
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !key) return Response.json({ error: "Payments not configured" }, { status: 503 });
  const raw = await req.text();
  const given = Buffer.from(req.headers.get("x-signature") ?? "");
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return Response.json({ error: "Bad signature" }, { status: 401 });
  let json: unknown; try { json = JSON.parse(raw); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const ev = paymentEventSchema.safeParse(json);
  if (!ev.success) return Response.json({ error: "Invalid event" }, { status: 400 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("apply_payment_event", { p_event_id: ev.data.eventId, p_provider: "gateway", p_ref: ev.data.reference, p_order: ev.data.orderId, p_amount: ev.data.amountMinor, p_status: ev.data.status, p_payload: ev.data });
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ result: data }); // 'duplicate' replies are still 200 so the gateway stops retrying
}
