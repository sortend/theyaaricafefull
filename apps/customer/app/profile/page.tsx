"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@yaari/database";

export default function Profile() {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [msg, setMsg] = useState(""); const [uid, setUid] = useState<string | null>(null);
  const sb = browserClient();
  useEffect(() => { (async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) { window.location.href = "/login"; return; }
    setUid(user.id); const { data } = await sb.from("profiles").select("full_name,phone").eq("id", user.id).maybeSingle();
    setName(data?.full_name ?? ""); setPhone(data?.phone ?? "");
  })(); }, []);
  async function save(e: React.FormEvent) { e.preventDefault(); const { error } = await sb.from("profiles").update({ full_name: name.trim() || null, phone: phone.trim() || null }).eq("id", uid!); setMsg(error ? error.message : "Saved."); }
  async function out() { await sb.auth.signOut(); window.location.href = "/"; }
  return (
    <main className="section" style={{ paddingTop: 140, maxWidth: 520 }}>
      <p className="eyebrow">Account</p><h2>Your profile</h2>
      <form onSubmit={save} className="cart">
        <label>Name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
        <label>Phone<input type="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} /></label>
        <button className="btn solid" type="submit" disabled={!uid}>Save</button> <button className="btn" type="button" onClick={out}>Sign out</button>
        <p role="status" aria-live="polite">{msg}</p>
      </form>
      <p><a href="/orders">View order history →</a></p>
    </main>
  );
}
