"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type P = { id: string; full_name: string | null; role: string; active: boolean };

export default function Staff() {
  const [rows, setRows] = useState<P[]>([]); const [err, setErr] = useState(""); const sb = browserClient();
  const load = useCallback(async () => { const { data, error } = await sb.from("profiles").select("id,full_name,role,active").order("created_at"); error ? setErr(error.message) : (setErr(""), setRows(data ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  const set = async (p: P, role: string, active: boolean) => { const { error } = await sb.rpc("set_staff_role", { p_user: p.id, p_role: role, p_active: active }); error ? setErr(error.message) : load(); };
  return (
    <main style={{ padding: 24 }}><h1>Staff and roles</h1>
      <p>People sign up on the customer site first; then assign a kitchen or delivery role here. Owner accounts are created only with the create-owner script.</p>{err && <p role="alert">{err}</p>}
      <table style={{ width: "100%" }}><thead><tr>{["User", "Role", "Active"].map((h) => <th key={h} align="left">{h}</th>)}</tr></thead><tbody>
        {rows.map((p) => <tr key={p.id}><td>{p.full_name ?? p.id.slice(0, 8)}</td>
          <td>{p.role === "owner" ? "owner" : <select aria-label={`Role for ${p.id.slice(0, 8)}`} value={p.role} onChange={(e) => set(p, e.target.value, p.active)}>{["customer", "kitchen", "delivery"].map((r) => <option key={r}>{r}</option>)}</select>}</td>
          <td>{p.role !== "owner" && <input type="checkbox" aria-label="Active" checked={p.active} onChange={(e) => set(p, p.role, e.target.checked)} />}</td></tr>)}
      </tbody></table></main>
  );
}
