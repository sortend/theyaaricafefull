"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@yaari/database";
type R = { id: string; party_size: number; starts_at: string; status: string; notes: string | null };

export default function Reservations() {
  const [rows, setRows] = useState<R[]>([]); const [err, setErr] = useState(""); const sb = browserClient();
  const load = useCallback(async () => { const { data, error } = await sb.from("reservations").select("id,party_size,starts_at,status,notes").order("starts_at"); error ? setErr(error.message) : (setErr(""), setRows(data ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  const rpc = async (fn: string, args: object) => { const { error } = await sb.rpc(fn, args); error ? setErr(error.message) : load(); };
  return (
    <main style={{ padding: 24 }}><h1>Reservations</h1><p><a href="/" style={{ color: "#c9a66b" }}>← Orders</a></p>{err && <p role="alert">{err}</p>}
      <table style={{ width: "100%" }}><thead><tr>{["When", "Guests", "Status", "Notes", "Actions"].map((h) => <th key={h} align="left">{h}</th>)}</tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{new Date(r.starts_at).toLocaleString()}</td><td>{r.party_size}</td><td>{r.status}</td><td>{r.notes}</td><td>
          <button onClick={() => rpc("set_reservation_status", { p_id: r.id, p_status: "confirmed" })}>Confirm</button>{" "}
          <button onClick={() => rpc("set_reservation_status", { p_id: r.id, p_status: "rejected" })}>Reject</button>{" "}
          <button onClick={() => rpc("set_reservation_status", { p_id: r.id, p_status: "cancelled" })}>Cancel</button>{" "}
          <input type="datetime-local" aria-label="Reschedule" onChange={(e) => e.target.value && rpc("reschedule_reservation", { p_id: r.id, p_start: new Date(e.target.value).toISOString() })} /></td></tr>)}
      </tbody></table></main>
  );
}
