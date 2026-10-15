"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type O = { id: string; order_number: number; status: string; payment_status: string; total_minor: number; created_at: string; order_items: { id: string; name_snapshot: string; quantity: number }[] };
const STEPS = ["new", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "completed"];

export default function Orders() {
  const [orders, setOrders] = useState<O[]>([]); const [err, setErr] = useState(""); const sb = browserClient();
  const load = useCallback(async () => {
    const { data, error } = await sb.from("orders").select("id,order_number,status,payment_status,total_minor,created_at,order_items(id,name_snapshot,quantity)").order("created_at", { ascending: false });
    if (error) return setErr(error.message); setErr(""); setOrders((data as unknown as O[]) ?? []);
  }, []);
  useEffect(() => { load(); const ch = sb.channel("my-orders").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe(); const p = setInterval(load, 10000); return () => { sb.removeChannel(ch); clearInterval(p); }; }, [load]);
  const cancel = async (id: string) => { const { error } = await sb.rpc("cancel_my_order", { p_order: id }); error ? setErr(error.message) : load(); };
  return (
    <main className="section" style={{ paddingTop: 140 }}>
      <p className="eyebrow">Your orders</p><h2>Live order tracking</h2>
      {err && <p role="alert">{err} — <a href="/login">sign in</a></p>}
      {!err && orders.length === 0 && <p>No orders yet. <a href="/menu">Browse the menu</a>.</p>}
      <div className="cols">{orders.map((o) => { const idx = STEPS.indexOf(o.status); return (
        <article key={o.id} className="card">
          <h3>Order #{o.order_number}</h3>
          <p className="price">{(o.total_minor / 100).toFixed(2)}</p>
          <p style={{ color: "var(--muted)" }}>{o.order_items.map((i) => `${i.quantity}× ${i.name_snapshot}`).join(", ")}</p>
          <p>Status: <strong style={{ textTransform: "capitalize" }}>{o.status.replace(/_/g, " ")}</strong> · Payment: {o.payment_status}</p>
          {idx >= 0 && <progress aria-label="Order progress" max={STEPS.length - 1} value={idx} style={{ width: "100%" }} />}
          {o.status === "new" && o.payment_status === "pending" && <button className="btn" onClick={() => cancel(o.id)}>Cancel order</button>}
        </article>); })}</div>
    </main>
  );
}
