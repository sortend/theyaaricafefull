import { cookies } from "next/headers";
import { serverClient } from "@yaari/database";
import { AutoRefresh } from "./AutoRefresh";
import { PayButton } from "./PayButton";
export const dynamic = "force-dynamic";
export const metadata = { title: "Order placed — The Yaari Café" };

export default async function Success({ searchParams }: { searchParams: { id?: string; confirming?: string } }) {
  const id = /^[0-9a-f-]{36}$/.test(searchParams.id ?? "") ? searchParams.id! : null;
  const { data: o } = id ? await serverClient(cookies()).from("orders").select("order_number,status,payment_status,payment_method,total_minor").eq("id", id).maybeSingle() : { data: null }; // RLS: own orders only
  return (
    <main className="section" style={{ paddingTop: 140, maxWidth: 640 }}>
      <p className="eyebrow">Thank you</p>
      {o && id ? <><h2>Order #{o.order_number} received</h2>
        <p>Total: <span className="price">{(o.total_minor / 100).toFixed(2)}</span></p>
        <p>Status: <strong>{o.status}</strong> · Payment: <strong>{o.payment_status}</strong></p>
        {o.payment_status === "paid" && <p>Payment received. Thank you!</p>}
        {o.payment_method === "cod" && o.payment_status === "pending" && <p style={{ color: "var(--muted)" }}>You chose cash payment. Please pay when you receive or collect your order.</p>}
        {o.payment_status === "pending" && searchParams.confirming && <><p style={{ color: "var(--muted)" }}>We are confirming your payment with the bank. This page updates automatically.</p><AutoRefresh /></>}
        {o.payment_method === "online" && (o.payment_status === "pending" && !searchParams.confirming || o.payment_status === "failed") && !["cancelled", "rejected"].includes(o.status) && <PayButton orderId={id} label={o.payment_status === "failed" ? "Retry payment" : "Pay online"} />}
        <p><a className="btn" href="/orders">Track my order</a></p></>
        : <><h2>We could not find that order</h2><p>Please check your order history.</p><a className="btn" href="/orders">My orders</a></>}
    </main>
  );
}
