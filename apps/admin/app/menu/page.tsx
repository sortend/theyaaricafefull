"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type I = { id: string; name: string; description: string | null; price_minor: number; published: boolean; available: boolean; category_id: string | null };

export default function MenuAdmin() {
  const [items, setItems] = useState<I[]>([]); const [cats, setCats] = useState<{ id: string; name: string }[]>([]); const [err, setErr] = useState(""); const sb = browserClient();
  const [f, setF] = useState({ name: "", description: "", price: "", category: "" });
  const load = useCallback(async () => {
    const [i, c] = await Promise.all([sb.from("menu_items").select("id,name,description,price_minor,published,available,category_id").eq("archived", false).order("name"), sb.from("categories").select("id,name").order("sort")]);
    const e = i.error || c.error; if (e) return setErr(e.message); setErr(""); setItems(i.data ?? []); setCats(c.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const upd = async (id: string, patch: object) => { const { error } = await sb.from("menu_items").update(patch).eq("id", id); error ? setErr(error.message) : load(); };
  async function add(e: React.FormEvent) {
    e.preventDefault(); const price = Math.round(parseFloat(f.price) * 100);
    if (!f.name.trim() || !(price >= 0)) return setErr("Enter a name and a valid price.");
    const { error } = await sb.from("menu_items").insert({ name: f.name.trim(), description: f.description || null, price_minor: price, category_id: f.category || null });
    error ? setErr(error.message) : (setF({ name: "", description: "", price: "", category: f.category }), load());
  }
  return (
    <main style={{ padding: 24 }}><h1>Menu management</h1><p>Items are added unpublished. Publish them when ready. Manage categories on the <a href="/categories" style={{ color: "#c9a66b" }}>Categories</a> page.</p>{err && <p role="alert">{err}</p>}
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <input aria-label="Name" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input aria-label="Description" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <input aria-label="Price" placeholder="Price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <select aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button type="submit">Add item</button></form>
      <table style={{ width: "100%" }}><thead><tr>{["Item", "Category", "Price", "Published", "Available", ""].map((h) => <th key={h} align="left">{h}</th>)}</tr></thead><tbody>
        {items.map((i) => <tr key={i.id}><td>{i.name}</td>
          <td><select aria-label={`Category for ${i.name}`} value={i.category_id ?? ""} onChange={(e) => upd(i.id, { category_id: e.target.value || null })}><option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
          <td>{(i.price_minor / 100).toFixed(2)} <button onClick={() => { const v = parseFloat(prompt("New price", String(i.price_minor / 100)) ?? ""); v >= 0 && upd(i.id, { price_minor: Math.round(v * 100) }); }}>Edit</button></td>
          <td><button onClick={() => upd(i.id, { published: !i.published })}>{i.published ? "Unpublish" : "Publish"}</button></td>
          <td><button onClick={() => upd(i.id, { available: !i.available })}>{i.available ? "Mark sold out" : "Mark available"}</button></td>
          <td><button onClick={() => confirm(`Archive ${i.name}?`) && upd(i.id, { archived: true, published: false })}>Archive</button></td></tr>)}
      </tbody></table></main>
  );
}
