import { cookies } from "next/headers";
import { serverClient } from "@yaari/database";
import { Menu } from "./Menu";
export const dynamic = "force-dynamic";
export const metadata = { title: "Menu — The Yaari Café" };

export default async function MenuPage({ searchParams }: { searchParams: { q?: string; category?: string } }) {
  const sb = serverClient(cookies());
  const q = (searchParams.q ?? "").replace(/[%,()]/g, "").trim().slice(0, 60);
  const cat = /^[0-9a-f-]{36}$/.test(searchParams.category ?? "") ? searchParams.category : undefined;
  let query = sb.from("menu_items").select("id,name,description,price_minor,item_options(id,kind,name,price_delta_minor)").eq("published", true).eq("available", true).eq("item_options.available", true).order("name");
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  if (cat) query = query.eq("category_id", cat);
  const [{ data, error }, { data: cats }] = await Promise.all([query, sb.from("categories").select("id,name").order("sort")]);
  return (
    <main className="section" style={{ paddingTop: 140 }}>
      <p className="eyebrow">The menu</p><h2>Taste of the Yaari</h2>
      <form method="get" role="search" style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 24px" }}>
        <input name="q" defaultValue={q} placeholder="Search the menu" aria-label="Search the menu" style={{ padding: 12, background: "var(--roast)", color: "var(--cream)", border: "1px solid #c9a66b55", font: "inherit" }} />
        {cat && <input type="hidden" name="category" value={cat} />}
        <button className="btn" type="submit">Search</button>
      </form>
      <nav aria-label="Categories" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
        <a className="btn" href="/menu" aria-current={!cat}>All</a>
        {(cats ?? []).map((c) => <a key={c.id} className="btn" href={`/menu?category=${c.id}`} aria-current={cat === c.id}>{c.name}</a>)}
      </nav>
      {error ? <p role="alert">Menu is unavailable right now.</p> : <Menu items={data ?? []} />}
    </main>
  );
}
