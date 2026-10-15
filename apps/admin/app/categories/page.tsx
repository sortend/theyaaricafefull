"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type C = { id: string; name: string; sort: number };

export default function Categories() {
  const [rows, setRows] = useState<C[]>([]); const [err, setErr] = useState(""); const [name, setName] = useState(""); const [sort, setSort] = useState("0"); const sb = browserClient();
  const load = useCallback(async () => { const { data, error } = await sb.from("categories").select("id,name,sort").order("sort").order("name"); error ? setErr(error.message) : (setErr(""), setRows(data ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) { e.preventDefault(); const { error } = await sb.from("categories").insert({ name: name.trim(), sort: parseInt(sort) || 0 }); error ? setErr(error.message) : (setName(""), load()); }
  const upd = async (id: string, patch: object) => { const { error } = await sb.from("categories").update(patch).eq("id", id); error ? setErr(error.message) : load(); };
  async function del(c: C) { if (!confirm(`Delete ${c.name}?`)) return; const { error } = await sb.from("categories").delete().eq("id", c.id); error ? setErr(error.code === "23503" ? "This category still has menu items. Move or archive them first." : error.message) : load(); }
  return (
    <main style={{ padding: 24 }}><h1>Categories</h1>{err && <p role="alert">{err}</p>}
      <form onSubmit={add} style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input aria-label="Category name" required placeholder="e.g. Coffee" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Sort order" type="number" value={sort} onChange={(e) => setSort(e.target.value)} />
        <button type="submit">Add category</button></form>
      <ul>{rows.map((c) => <li key={c.id}>{c.name} (order {c.sort}){" "}
        <button onClick={() => { const v = prompt("New name", c.name)?.trim(); v && upd(c.id, { name: v }); }}>Rename</button>{" "}
        <button onClick={() => { const v = parseInt(prompt("Sort order", String(c.sort)) ?? ""); !isNaN(v) && upd(c.id, { sort: v }); }}>Reorder</button>{" "}
        <button onClick={() => del(c)}>Delete</button></li>)}</ul></main>
  );
}
