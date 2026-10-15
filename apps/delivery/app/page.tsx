"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type Row = { order_id: string; status: string; orders: { order_number: number; status: string; payment_status: string; payment_method: string; total_minor: number; notes: string | null; address: { line1: string; city: string; postalCode: string; phone: string } | null } };

export default function Delivery() {
  const [rows, setRows] = useState<Row[]>([]); const [err, setErr] = useState("");
  const sb = browserClient();
  const load = useCallback(async () => {
    // RLS returns only this staff member's assignments.
    const { data, error } = await sb.from("delivery_assignments").select("order_id,status,orders(order_number,status,payment_status,payment_method,total_minor,notes,address)").order("created_at", { ascending: false });
    if (error) return setErr(error.message); setErr(""); setRows((data as unknown as Row[]) ?? []);
  }, []);
  useEffect(() => { load(); const ch = sb.channel("d").on("postgres_changes", { event: "*", schema: "public", table: "delivery_assignments" }, load).subscribe(); const p = setInterval(load, 15000); return () => { sb.removeChannel(ch); clearInterval(p); }; }, [load]);
  const run = async (fn: string, args: object) => { const { error } = await sb.rpc(fn, args); error ? setErr(error.message) : load(); };
  return (
    <main style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
      <h1>My deliveries</h1>{err && <p role="alert">{err} — <a href="/login" style={{ color: "#c9a66b" }}>sign in</a></p>}
      {rows.length === 0 && <p>No assignments right now.</p>}
      {rows.map((r) => { const o = r.orders, a = o.address; const q = encodeURIComponent(a ? `${a.line1}, ${a.city} ${a.postalCode}` : "");
        return (
        <article key={r.order_id} style={{ border: "1px solid #c9a66b", padding: 16, margin: "16px 0" }}>
          <h2>Order #{o.order_number} · {r.status}</h2>
          {o.payment_method === "cod" && o.payment_status === "pending" ? <p><strong>Collect {(o.total_minor / 100).toFixed(2)} in cash on delivery</strong></p> : <p>Payment: <strong>{o.payment_status === "paid" ? "Settled (no cash due)" : o.payment_status}</strong></p>}
          {a && <p>{a.line1}, {a.city} {a.postalCode}<br /><a style={{ color: "#c9a66b" }} href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer">Open directions</a> · <a style={{ color: "#c9a66b" }} href={`tel:${a.phone}`}>Call customer</a></p>}
          {o.notes && <p>Note: {o.notes}</p>}
          {r.status === "assigned" && <><button onClick={() => run("respond_assignment", { p_order: r.order_id, p_accept: true })}>Accept</button> <button onClick={() => run("respond_assignment", { p_order: r.order_id, p_accept: false })}>Reject</button></>}
          {r.status === "accepted" && o.status === "ready" && <button onClick={() => run("transition_order", { p_order: r.order_id, p_to: "out_for_delivery" })}>Picked up — start delivery</button>}
          {r.status === "accepted" && o.status !== "ready" && o.status !== "out_for_delivery" && o.status !== "delivered" && <p>Waiting for kitchen (order is {o.status}).</p>}
          {o.payment_method === "cod" && o.payment_status === "pending" && ["out_for_delivery", "delivered"].includes(o.status) && <button onClick={() => run("record_cash_payment", { p_order: r.order_id })}>Cash collected</button>}
          {o.status === "out_for_delivery" && <button onClick={() => run("transition_order", { p_order: r.order_id, p_to: "delivered" })}>Mark delivered</button>}
        </article>); })}
    </main>
  );
}
