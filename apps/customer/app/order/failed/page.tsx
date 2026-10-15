export const metadata = { title: "Order not completed — The Yaari Café" };
export default function Failed() {
  return (
    <main className="section" style={{ paddingTop: 140, maxWidth: 640 }}>
      <p className="eyebrow">Something went wrong</p><h2>Your order was not completed</h2>
      <p style={{ color: "var(--muted)" }}>No order was placed and nothing was charged. Your cart is still on the menu page, so you can try again.</p>
      <a className="btn solid" href="/menu">Back to menu</a>
    </main>
  );
}
