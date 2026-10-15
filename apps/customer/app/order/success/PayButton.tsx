"use client";
import { useState } from "react";
declare global { interface Window { Razorpay?: any } }
const load = () => new Promise<void>((ok, bad) => { if (window.Razorpay) return ok(); const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => ok(); s.onerror = () => bad(); document.body.appendChild(s); });

export function PayButton({ orderId, label = "Pay online" }: { orderId: string; label?: string }) {
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function pay() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) }).catch(() => null);
    const b = r ? await r.json().catch(() => null) : null;
    if (!r || !r.ok || !b) { setBusy(false); return setMsg(b?.error ?? "Could not start payment."); }
    try { await load(); } catch { setBusy(false); return setMsg("Could not load the payment window."); }
    const rz = new window.Razorpay({ key: b.keyId, amount: b.amount, currency: b.currency, order_id: b.razorpayOrderId, name: "The Yaari Café", theme: { color: "#c9a66b" },
      handler: () => { window.location.href = `/order/success?id=${orderId}&confirming=1`; }, // NOT proof of payment; the verified webhook decides
      modal: { ondismiss: () => { setBusy(false); setMsg("Payment window closed. You can try again."); } } });
    rz.on("payment.failed", () => setMsg("Payment failed. You can retry in the window."));
    rz.open();
  }
  return <><button className="btn solid" onClick={pay} disabled={busy}>{busy ? "Opening…" : label}</button><p role="status" aria-live="polite">{msg}</p></>;
}
