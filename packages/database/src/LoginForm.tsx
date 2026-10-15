"use client";
import { useState } from "react";
import { browserClient } from "./index";

export function LoginForm({ allowSignUp = false }: { allowSignUp?: boolean }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in"); const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const sb = browserClient();
    const { error } = mode === "in" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg("Check your email to confirm your account.");
    window.location.href = "/";
  }
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 340 }}>
      <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
      <label>Password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
      <button type="submit">{mode === "in" ? "Sign in" : "Create account"}</button>
      {allowSignUp && <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "New here? Register" : "Have an account? Sign in"}</button>}
      <p role="status" aria-live="polite">{msg}</p>
    </form>
  );
}
