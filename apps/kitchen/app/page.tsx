"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type Order = { id: string; order_number: number; status: string; type: string; payment_status: string; notes: string | null; created_at: string; order_items: { id: string; name_snapshot: string; quantity: number; instructions: string | null; options: { name: string }[] }[] };
const NEXT: Record<string, string> = { new: "accepted", accepted: "preparing", preparing: "ready" };
const LABEL: Record<string, string> = { new: "Accept", accepted: "Start preparing", preparing: "Mark ready" };

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([]); const [err, setErr] = useState(""); const [now, setNow] = useState(Date.now());
  const sb = browserClient();
  const load = useCallback(async () => {
    const { data, error } = await sb.from("orders").select("id,order_number,status,type,payment_status,notes,created_at,order_items(id,name_snapshot,quantity,instructions,options)")
      .in("status", ["new", "accepted", "preparing", "ready"]).order("created_at");
    if (error) return setErr(error.message);
    setErr(""); setOrders((data as unknown as Order[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const ch = sb.channel("kitchen-orders").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    const poll = setInterval(load, 15000); // fallback if realtime drops; load() is idempotent so duplicates are harmless
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { sb.removeChannel(ch); clearInterval(poll); clearInterval(tick); };
  }, [load]);
  async function advance(o: Order) {
    const { error } = await sb.rpc("transition_order", { p_order: o.id, p_to: NEXT[o.status] });
    if (error) setErr(error.message); else load();
  }
  const mins = (t: string) => Math.floor((now - new Date(t).getTime()) / 60000);
  return (
    <main style={{ padding: 24 }}>
      <h1>Kitchen</h1>{err && <p role="alert">{err} — <a href="/login" style={{ color: "#c9a66b" }}>sign in</a></p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {["new", "accepted,preparing", "ready"].map((col) => (
          <section key={col} aria-label={col}><h2 style={{ textTransform: "capitalize" }}>{col.replace(",", " / ")}</h2>
            {orders.filter((o) => col.split(",").includes(o.status)).map((o) => (
              <article key={o.id} style={{ border: "1px solid #c9a66b", padding: 12, marginBottom: 12 }}>
                <h3>#{o.order_number} · {o.type} · {mins(o.created_at)} min</h3>
                <p>Payment: <strong>{o.payment_status}</strong> (read-only; set by verified payment events)</p>
                <ul>{o.order_items.map((i) => <li key={i.id}>{i.quantity}× {i.name_snapshot}{i.options?.length ? ` (${i.options.map((o) => o.name).join(", ")})` : ""}{i.instructions ? ` — ${i.instructions}` : ""}</li>)}</ul>
                {o.notes && <p>Note: {o.notes}</p>}
                {NEXT[o.status] && <button onClick={() => advance(o)} style={{ padding: "12px 20px", fontSize: 18 }}>{LABEL[o.status]}</button>}
              </article>))}
          </section>))}
      </div>
    </main>
  );
}
