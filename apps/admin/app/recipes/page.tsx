"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type R = { menu_item_id: string; ingredient_id: string; qty: number; menu_items: { name: string } | null; ingredients: { name: string; unit: string } | null };

export default function Recipes() {
  const [rows, setRows] = useState<R[]>([]); const [items, setItems] = useState<{ id: string; name: string }[]>([]); const [ings, setIngs] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [f, setF] = useState({ item: "", ing: "", qty: "" }); const [err, setErr] = useState(""); const sb = browserClient();
  const load = useCallback(async () => {
    const [r, i, g] = await Promise.all([sb.from("recipes").select("menu_item_id,ingredient_id,qty,menu_items(name),ingredients(name,unit)"), sb.from("menu_items").select("id,name").eq("archived", false).order("name"), sb.from("ingredients").select("id,name,unit").order("name")]);
    const e = r.error || i.error || g.error; if (e) return setErr(e.message); setErr(""); setRows((r.data as unknown as R[]) ?? []); setItems(i.data ?? []); setIngs(g.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(e: React.FormEvent) { e.preventDefault(); const { error } = await sb.from("recipes").upsert({ menu_item_id: f.item, ingredient_id: f.ing, qty: +f.qty }); error ? setErr(error.message) : load(); }
  const del = async (r: R) => { const { error } = await sb.from("recipes").delete().eq("menu_item_id", r.menu_item_id).eq("ingredient_id", r.ingredient_id); error ? setErr(error.message) : load(); };
  return (
    <main style={{ padding: 24 }}><h1>Recipes</h1><p>Stock is deducted once, when the kitchen accepts an order. Items without a recipe deduct nothing. Cancelled orders are not restocked automatically.</p>{err && <p role="alert">{err}</p>}
      <form onSubmit={save} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <select aria-label="Menu item" required value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}><option value="">Menu item</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <select aria-label="Ingredient" required value={f.ing} onChange={(e) => setF({ ...f, ing: e.target.value })}><option value="">Ingredient</option>{ings.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select>
        <input aria-label="Quantity per item" type="number" step="any" min="0.0001" required placeholder="Qty per item" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        <button type="submit">Save recipe line</button></form>
      <ul>{rows.map((r) => <li key={r.menu_item_id + r.ingredient_id}>{r.menu_items?.name}: {r.qty} {r.ingredients?.unit} {r.ingredients?.name} <button onClick={() => del(r)}>Remove</button></li>)}</ul></main>
  );
}
