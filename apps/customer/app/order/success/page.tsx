import { cookies } from "next/headers";
import { serverClient } from "@yaari/database";
export const dynamic = "force-dynamic";
export const metadata = { title: "Order placed — The Yaari Café" };

export default async function Success({ searchParams }: { searchParams: { id?: string } }) {
  const id = /^[0-9a-f-]{36}$/.test(searchParams.id ?? "") ? searchParams.id! : null;
  // RLS guarantees a customer can only read their own order.
  const { data: o } = id ? await serverClient(cookies()).from("orders").select("order_number,status,payment_status,total_minor").eq("id", id).maybeSingle() : { data: null };
  return (
    <main className="section" style={{ paddingTop: 140, maxWidth: 640 }}>
      <p className="eyebrow">Thank you</p>
      {o ? <><h2>Order #{o.order_number} received</h2>
        <p>Total: <span className="price">{(o.total_minor / 100).toFixed(2)}</span></p>
        <p>Status: <strong>{o.status}</strong> · Payment: <strong>{o.payment_status}</strong></p>
        {o.payment_status === "pending" && <p style={{ color: "var(--muted)" }}>Online payment is not enabled yet, so your payment remains pending until the café confirms it.</p>}
        <a className="btn solid" href="/orders">Track my order</a></>
        : <><h2>We could not find that order</h2><p>Please check your order history.</p><a className="btn" href="/orders">My orders</a></>}
    </main>
  );
}
