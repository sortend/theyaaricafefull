"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type I = { id: string; name: string; description: string | null; price_minor: number; published: boolean; available: boolean };

export default function MenuAdmin() {
  const [items, setItems] = useState<I[]>([]); const [err, setErr] = useState(""); const sb = browserClient();
  const [f, setF] = useState({ name: "", description: "", price: "" });
  const load = useCallback(async () => { const { data, error } = await sb.from("menu_items").select("id,name,description,price_minor,published,available").eq("archived", false).order("name"); error ? setErr(error.message) : (setErr(""), setItems(data ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  const upd = async (id: string, patch: object) => { const { error } = await sb.from("menu_items").update(patch).eq("id", id); error ? setErr(error.message) : load(); };
  async function add(e: React.FormEvent) {
    e.preventDefault(); const price = Math.round(parseFloat(f.price) * 100);
    if (!f.name.trim() || !(price >= 0)) return setErr("Enter a name and a valid price.");
    const { error } = await sb.from("menu_items").insert({ name: f.name.trim(), description: f.description || null, price_minor: price });
    error ? setErr(error.message) : (setF({ name: "", description: "", price: "" }), load());
  }
  return (
    <main style={{ padding: 24 }}><h1>Menu management</h1>{err && <p role="alert">{err}</p>}
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <input aria-label="Name" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input aria-label="Description" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <input aria-label="Price" placeholder="Price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <button type="submit">Add (unpublished)</button></form>
      <table style={{ width: "100%" }}><thead><tr>{["Item", "Price", "Published", "Available", ""].map((h) => <th key={h} align="left">{h}</th>)}</tr></thead><tbody>
        {items.map((i) => <tr key={i.id}><td>{i.name}</td><td>{(i.price_minor / 100).toFixed(2)} <button onClick={() => { const v = parseFloat(prompt("New price", String(i.price_minor / 100)) ?? ""); v >= 0 && upd(i.id, { price_minor: Math.round(v * 100) }); }}>Edit</button></td>
          <td><button onClick={() => upd(i.id, { published: !i.published })}>{i.published ? "Unpublish" : "Publish"}</button></td>
          <td><button onClick={() => upd(i.id, { available: !i.available })}>{i.available ? "Mark sold out" : "Mark available"}</button></td>
          <td><button onClick={() => confirm(`Archive ${i.name}?`) && upd(i.id, { archived: true, published: false })}>Archive</button></td></tr>)}
      </tbody></table></main>
  );
}
