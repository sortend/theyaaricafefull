import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { serverClient } from "@yaari/database";

// Starts an online payment: creates (or reuses) a Razorpay order for the customer's own unpaid order. Does NOT mark anything paid.
export async function POST(req: Request) {
  const orderId = (await req.json().catch(() => null))?.orderId;
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/.test(orderId)) return Response.json({ error: "Invalid order" }, { status: 400 });
  const sb = serverClient(cookies());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in" }, { status: 401 });
  const { data: o } = await sb.from("orders").select("id,order_number,total_minor,status,payment_status,payment_method").eq("id", orderId).maybeSingle(); // RLS: own orders only
  if (!o) return Response.json({ error: "Order not found" }, { status: 404 });
  if (o.payment_method !== "online" || o.payment_status !== "pending" || ["cancelled", "rejected"].includes(o.status)) return Response.json({ error: "This order cannot be paid" }, { status: 409 });
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, SUPABASE_SERVICE_ROLE_KEY: svc } = process.env;
  if (!keyId || !keySecret || !svc) return Response.json({ error: "Online payment is not available right now" }, { status: 503 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, svc, { auth: { persistSession: false } });
  const { data: existing } = await admin.from("payments").select("provider_ref").eq("order_id", o.id).eq("status", "pending").maybeSingle();
  let rzpOrderId = existing?.provider_ref as string | undefined;
  if (!rzpOrderId) {
    const r = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64") },
      body: JSON.stringify({ amount: o.total_minor, currency: "INR", receipt: `yaari-${o.order_number}`, notes: { yaari_order_id: o.id } }) });
    if (!r.ok) return Response.json({ error: "Payment provider error" }, { status: 502 });
    rzpOrderId = (await r.json()).id as string;
    const { error } = await admin.from("payments").insert({ order_id: o.id, provider: "razorpay", provider_ref: rzpOrderId, status: "pending", amount_minor: o.total_minor });
    if (error) return Response.json({ error: "Could not record payment" }, { status: 500 });
  }
  return Response.json({ keyId, razorpayOrderId: rzpOrderId, amount: o.total_minor, currency: "INR" });
}
