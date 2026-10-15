"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type G = { id: string; name: string; unit: string; quantity: number; reorder_level: number };

export default function Inventory() {
  const [rows, setRows] = useState<G[]>([]); const [err, setErr] = useState(""); const sb = browserClient();
  const [f, setF] = useState({ name: "", unit: "kg", reorder: "0" });
  const load = useCallback(async () => { const { data, error } = await sb.from("ingredients").select("id,name,unit,quantity,reorder_level").order("name"); error ? setErr(error.message) : (setErr(""), setRows(data ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) { e.preventDefault(); const { error } = await sb.from("ingredients").insert({ name: f.name.trim(), unit: f.unit, reorder_level: +f.reorder || 0 }); error ? setErr(error.message) : (setF({ ...f, name: "" }), load()); }
  async function adjust(g: G) {
    const d = parseFloat(prompt(`Change in ${g.unit} (negative to remove)`) ?? ""); if (!d) return;
    const reason = prompt("Reason (required)") ?? ""; if (!reason.trim()) return setErr("A reason is required.");
    const { error } = await sb.rpc("adjust_stock", { p_ing: g.id, p_delta: d, p_reason: reason }); error ? setErr(error.message) : load();
  }
  return (
    <main style={{ padding: 24 }}><h1>Inventory</h1>
      <p>Stock changes only when you record them here. Orders do not deduct stock until recipes are configured.</p>{err && <p role="alert">{err}</p>}
      <form onSubmit={add} style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input aria-label="Ingredient" placeholder="Ingredient" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input aria-label="Unit" placeholder="Unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        <input aria-label="Reorder level" type="number" value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} />
        <button type="submit">Add</button></form>
      <table style={{ width: "100%" }}><thead><tr>{["Ingredient", "Stock", "Reorder at", ""].map((h) => <th key={h} align="left">{h}</th>)}</tr></thead><tbody>
        {rows.map((g) => <tr key={g.id} style={{ color: g.quantity <= g.reorder_level ? "#ff8a6b" : undefined }}><td>{g.name}</td><td>{g.quantity} {g.unit}{g.quantity <= g.reorder_level ? " — LOW" : ""}</td><td>{g.reorder_level}</td><td><button onClick={() => adjust(g)}>Adjust stock</button></td></tr>)}
      </tbody></table></main>
  );
}
