"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type O = { id: string; kind: string; name: string; price_delta_minor: number; available: boolean; menu_items: { name: string } | null };

export default function Options() {
  const [rows, setRows] = useState<O[]>([]); const [items, setItems] = useState<{ id: string; name: string }[]>([]); const [err, setErr] = useState(""); const sb = browserClient();
  const [f, setF] = useState({ item: "", kind: "size", name: "", delta: "0" });
  const load = useCallback(async () => {
    const [o, i] = await Promise.all([sb.from("item_options").select("id,kind,name,price_delta_minor,available,menu_items(name)").order("created_at" as any, { ascending: false } as any), sb.from("menu_items").select("id,name").eq("archived", false).order("name")]);
    const e = o.error || i.error; if (e) return setErr(e.message); setErr(""); setRows((o.data as unknown as O[]) ?? []); setItems(i.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) { e.preventDefault(); const { error } = await sb.from("item_options").insert({ menu_item_id: f.item, kind: f.kind, name: f.name.trim(), price_delta_minor: Math.round(parseFloat(f.delta) * 100) || 0 }); error ? setErr(error.message) : (setF({ ...f, name: "", delta: "0" }), load()); }
  const upd = async (id: string, patch: object) => { const { error } = await sb.from("item_options").update(patch).eq("id", id); error ? setErr(error.message) : load(); };
  const del = async (id: string) => { const { error } = await sb.from("item_options").delete().eq("id", id); error ? setErr(error.message) : load(); };
  return (
    <main style={{ padding: 24 }}><h1>Sizes and add-ons</h1><p>Customers can pick one size and any add-ons. Price changes are in currency units (e.g. 50 or -10). Existing orders keep the price they were placed at.</p>{err && <p role="alert">{err}</p>}
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <select aria-label="Menu item" required value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}><option value="">Menu item</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <select aria-label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="size">Size</option><option value="addon">Add-on</option></select>
        <input aria-label="Option name" required placeholder="e.g. Large" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input aria-label="Price change" inputMode="decimal" value={f.delta} onChange={(e) => setF({ ...f, delta: e.target.value })} />
        <button type="submit">Add option</button></form>
      <ul>{rows.map((o) => <li key={o.id}>{o.menu_items?.name} · {o.kind} · {o.name} ({(o.price_delta_minor / 100).toFixed(2)}) <button onClick={() => upd(o.id, { available: !o.available })}>{o.available ? "Hide" : "Show"}</button> <button onClick={() => confirm("Delete option?") && del(o.id)}>Delete</button></li>)}</ul></main>
  );
}
