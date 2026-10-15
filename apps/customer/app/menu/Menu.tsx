"use client";
import { useState } from "react";
type Opt = { id: string; kind: "size" | "addon"; name: string; price_delta_minor: number };
type Item = { id: string; name: string; description: string | null; price_minor: number; item_options: Opt[] };
type Line = { item: Item; optionIds: string[]; quantity: number };
const money = (m: number) => (m / 100).toFixed(2);
const unit = (l: Line) => l.item.price_minor + l.item.item_options.filter((o) => l.optionIds.includes(o.id)).reduce((s, o) => s + o.price_delta_minor, 0);
const key = (l: Line) => l.item.id + ":" + [...l.optionIds].sort().join(",");

function ItemCard({ item, onAdd }: { item: Item; onAdd: (ids: string[]) => void }) {
  const sizes = item.item_options.filter((o) => o.kind === "size"), addons = item.item_options.filter((o) => o.kind === "addon");
  const [size, setSize] = useState(sizes[0]?.id ?? ""); const [extra, setExtra] = useState<string[]>([]);
  const d = (o: Opt) => (o.price_delta_minor ? ` (${o.price_delta_minor > 0 ? "+" : "−"}${money(Math.abs(o.price_delta_minor))})` : "");
  return (
    <article className="card">
      <h3><a href={`/menu/${item.id}`}>{item.name}</a></h3><p style={{ color: "var(--muted)" }}>{item.description}</p><div className="price">{money(item.price_minor)}</div>
      {sizes.length > 0 && <fieldset style={{ border: 0, padding: 0 }}><legend>Size</legend>{sizes.map((o) => <label key={o.id} style={{ display: "block" }}><input type="radio" name={`size-${item.id}`} checked={size === o.id} onChange={() => setSize(o.id)} /> {o.name}{d(o)}</label>)}</fieldset>}
      {addons.length > 0 && <fieldset style={{ border: 0, padding: 0 }}><legend>Add-ons</legend>{addons.map((o) => <label key={o.id} style={{ display: "block" }}><input type="checkbox" checked={extra.includes(o.id)} onChange={(e) => setExtra(e.target.checked ? [...extra, o.id] : extra.filter((x) => x !== o.id))} /> {o.name}{d(o)}</label>)}</fieldset>}
      <button className="btn" style={{ marginTop: 14 }} onClick={() => onAdd([...(size ? [size] : []), ...extra])}>Add to order</button>
    </article>
  );
}

export function Menu({ items }: { items: Item[] }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [type, setType] = useState<"pickup" | "delivery" | "dine_in">("pickup");
  const [addr, setAddr] = useState({ line1: "", city: "", postalCode: "", phone: "" });
  const [pay, setPay] = useState<"online" | "cod">("online"); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const estimate = lines.reduce((s, l) => s + unit(l) * l.quantity, 0); // display only; the server recomputes
  const add = (item: Item, optionIds: string[]) => setLines((ls) => { const n: Line = { item, optionIds, quantity: 1 }; const i = ls.findIndex((l) => key(l) === key(n)); return i < 0 ? [...ls, n] : ls.map((l, j) => (j === i ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l)); });
  const bump = (k: string, d: number) => setLines((ls) => ls.map((l) => (key(l) === k ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));

  async function checkout() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, paymentMethod: pay, items: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity, optionIds: l.optionIds })), address: type === "delivery" ? addr : undefined }) }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null; setBusy(false);
    if (!res || !body) { window.location.href = "/order/failed"; return; }
    if (res.status === 401) { window.location.href = "/login"; return; }
    if (!res.ok) return setMsg(typeof body.error === "string" ? body.error : "Please check your details.");
    setLines([]); window.location.href = `/order/success?id=${body.orderId}`;
  }
  return (
    <>
      <div className="cols">
        {items.map((i) => <ItemCard key={i.id} item={i} onAdd={(ids) => add(i, ids)} />)}
        {items.length === 0 && <p>No items are available right now.</p>}
      </div>
      <section className="cart" aria-label="Cart">
        <h2 style={{ fontSize: "2rem" }}>Your order</h2>
        {lines.length === 0 && <p style={{ color: "var(--muted)" }}>Your cart is empty.</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>{lines.map((l) => <li key={key(l)} style={{ margin: "10px 0" }}>
          {l.item.name}{l.optionIds.length > 0 && <small style={{ color: "var(--muted)" }}> — {l.item.item_options.filter((o) => l.optionIds.includes(o.id)).map((o) => o.name).join(", ")}</small>} · {money(unit(l))}
          <span className="qty" style={{ display: "inline-flex", marginLeft: 12, marginTop: 0 }}><button aria-label={`Remove one ${l.item.name}`} onClick={() => bump(key(l), -1)}>−</button><span aria-live="polite">{l.quantity}</span><button aria-label={`Add one ${l.item.name}`} onClick={() => bump(key(l), 1)}>+</button></span></li>)}</ul>
        <label>Order type<select value={type} onChange={(e) => setType(e.target.value as any)}><option value="pickup">Pickup</option><option value="delivery">Delivery</option><option value="dine_in">Dine-in</option></select></label>
        <label>Payment<select value={pay} onChange={(e) => setPay(e.target.value as any)}><option value="online">Pay online (UPI, card, netbanking)</option><option value="cod">{type === "delivery" ? "Cash on delivery" : type === "pickup" ? "Pay cash at pickup" : "Pay cash at the table"}</option></select></label>
        {type === "delivery" && (["line1", "city", "postalCode", "phone"] as const).map((k) => <label key={k}>{k}<input value={addr[k]} onChange={(e) => setAddr({ ...addr, [k]: e.target.value })} /></label>)}
        <p>Estimated subtotal: <span className="price">{money(estimate)}</span><br /><small style={{ color: "var(--muted)" }}>Tax and fees are calculated securely on the server.</small></p>
        <button className="btn solid" disabled={!lines.length || busy} onClick={checkout}>{busy ? "Placing…" : "Place order"}</button>
        <p role="status" aria-live="polite">{msg}</p>
      </section>
    </>
  );
}
