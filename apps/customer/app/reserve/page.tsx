"use client";
import { useState } from "react";
import { browserClient } from "@yaari/database";

export default function Reserve() {
  const [party, setParty] = useState(2); const [when, setWhen] = useState(""); const [notes, setNotes] = useState(""); const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const { error } = await browserClient().rpc("create_reservation", { p_party: party, p_start: new Date(when).toISOString(), p_notes: notes || null });
    if (error) return setMsg(/authenticated/.test(error.message) ? "Please sign in first." : error.message);
    setMsg("Request received. We will confirm your table shortly.");
  }
  return (
    <main className="section" style={{ paddingTop: 140, maxWidth: 560 }}>
      <p className="eyebrow">Reservations</p><h2>Reserve a table</h2>
      <form onSubmit={submit} className="cart">
        <label>Guests<input type="number" min={1} max={20} required value={party} onChange={(e) => setParty(+e.target.value)} /></label>
        <label>Date and time<input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <label>Notes<input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></label>
        <button className="btn solid" type="submit">Request table</button>
        <p role="status" aria-live="polite">{msg}</p>
      </form>
    </main>
  );
}
