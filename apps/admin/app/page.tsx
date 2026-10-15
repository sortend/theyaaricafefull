"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type Order = { id: string; order_number: number; status: string; type: string; payment_status: string; payment_method: string; total_minor: number; created_at: string; delivery_assignments: { staff_id: string; status: string }[] };
type Staff = { id: string; full_name: string | null }; type Item = { id: string; name: string; price_minor: number; available: boolean };
const m = (v: number) => (v / 100).toFixed(2);

export default function Admin() {
  const [orders, setOrders] = useState<Order[]>([]); const [staff, setStaff] = useState<Staff[]>([]); const [items, setItems] = useState<Item[]>([]); const [err, setErr] = useState("");
  const sb = browserClient();
  const load = useCallback(async () => {
    const [o, s, i] = await Promise.all([
      sb.from("orders").select("id,order_number,status,type,payment_status,payment_method,total_minor,created_at,delivery_assignments(staff_id,status)").order("created_at", { ascending: false }).limit(100),
      sb.from("profiles").select("id,full_name").eq("role", "delivery").eq("active", true),
      sb.from("menu_items").select("id,name,price_minor,available").eq("archived", false).order("name")]);
    const e = o.error || s.error || i.error; if (e) return setErr(e.message);
    setErr(""); setOrders((o.data as unknown as Order[]) ?? []); setStaff(s.data ?? []); setItems(i.data ?? []);
  }, []);
  useEffect(() => { load(); const ch = sb.channel("a").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe(); const p = setInterval(load, 20000); return () => { sb.removeChannel(ch); clearInterval(p); }; }, [load]);
  const rpc = async (fn: string, args: object) => { const { error } = await sb.rpc(fn, args); error ? setErr(error.message) : load(); };
  async function refund(o: Order) {
    const v = prompt("Refund amount (leave blank for the full remaining amount)", ""); if (v === null) return;
    const amountMinor = v.trim() ? Math.round(parseFloat(v) * 100) : undefined; if (v.trim() && !(amountMinor! > 0)) return setErr("Enter a valid amount.");
    const r = await fetch("/api/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: o.id, amountMinor }) });
    const b = await r.json().catch(() => null); r.ok ? (setErr(""), alert("Refund initiated. Status updates when the bank confirms.")) : setErr(b?.error ?? "Refund failed");
  }
  const paidRevenue = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total_minor, 0); // verified payments only
  const unpaid = orders.filter((o) => o.payment_status === "pending" && !["cancelled", "rejected"].includes(o.status)).reduce((s, o) => s + o.total_minor, 0);
  return (
    <main style={{ padding: 24 }}>
      <h1>Owner control panel <a href="/reservations" style={{ fontSize: 16, color: "#c9a66b" }}>Reservations →</a></h1>{err && <p role="alert">{err} — <a href="/login" style={{ color: "#c9a66b" }}>sign in</a></p>}
      <p>Verified revenue (recent 100): <strong>{m(paidRevenue)}</strong> · Unpaid pending: <strong>{m(unpaid)}</strong> · Orders: {orders.length}</p>
      <h2>Orders</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "Type", "Status", "Payment", "Total", "Delivery", "Actions"].map((h) => <th key={h} align="left">{h}</th>)}</tr></thead><tbody>
        {orders.map((o) => { const d = o.delivery_assignments[0]; return (
          <tr key={o.id} style={{ borderTop: "1px solid #c9a66b33" }}><td>{o.order_number}</td><td>{o.type}</td><td>{o.status}</td><td>{o.payment_status}</td><td>{m(o.total_minor)}</td>
            <td>{o.type === "delivery" ? <select aria-label={`Assign delivery for order ${o.order_number}`} value={d?.staff_id ?? ""} onChange={(e) => e.target.value && rpc("assign_delivery", { p_order: o.id, p_staff: e.target.value })}><option value="">{d ? "" : "Unassigned"}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name ?? s.id.slice(0, 6)}</option>)}</select> : "—"}{d ? ` (${d.status})` : ""}</td>
            <td>{!["completed", "cancelled", "rejected", "delivered"].includes(o.status) && <button onClick={() => confirm("Cancel this order?") && rpc("transition_order", { p_order: o.id, p_to: "cancelled" })}>Cancel</button>}{o.payment_method === "cod" && o.payment_status === "pending" && !["cancelled", "rejected"].includes(o.status) && <button onClick={() => confirm("Confirm the cash was received?") && rpc("record_cash_payment", { p_order: o.id })}>Cash received</button>}{["paid", "partially_refunded"].includes(o.payment_status) && <button onClick={() => refund(o)}>Refund</button>}</td></tr>); })}
      </tbody></table>
      <h2>Menu availability</h2>
      <ul>{items.map((i) => <li key={i.id}>{i.name} ({m(i.price_minor)}) <button onClick={async () => { const { error } = await sb.from("menu_items").update({ available: !i.available }).eq("id", i.id); error ? setErr(error.message) : load(); }}>{i.available ? "Mark sold out" : "Mark available"}</button></li>)}</ul>
    </main>
  );
}
