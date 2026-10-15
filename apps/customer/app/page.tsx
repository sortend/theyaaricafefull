import { HeroScene } from "./HeroScene";
export default function Home() {
  return (
    <main>
      <section className="hero"><HeroScene /><div>
        <p className="eyebrow">Est. with friendship</p>
        <h1>Where every cup feels like <em>yaari</em></h1>
        <p>Slow-roasted coffee, handcrafted plates and warm company — order for pickup, dine-in or delivery.</p>
        <a className="btn solid" href="/menu">Order now</a>
      </div></section>
      <section className="section">
        <p className="eyebrow">Our promise</p><h2>Crafted with care</h2>
        <div className="cols">
          <article className="card"><h3>Single-origin beans</h3><p>Roasted in small batches for depth and balance.</p></article>
          <article className="card"><h3>Made to order</h3><p>Every plate is prepared fresh when you order.</p></article>
          <article className="card"><h3>Live order status</h3><p>Follow your order from kitchen to table or door.</p></article>
        </div>
      </section>
    </main>
  );
}
