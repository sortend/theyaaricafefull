import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { serverClient } from "@yaari/database";
export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const { data } = await serverClient(cookies()).from("menu_items").select("name,description,price_minor,available").eq("id", params.id).eq("published", true).maybeSingle();
  if (!data) notFound();
  return (
    <main className="section" style={{ paddingTop: 140, maxWidth: 760 }}>
      <p className="eyebrow"><a href="/menu">← Back to menu</a></p>
      <h2>{data.name}</h2><p style={{ color: "var(--muted)", fontSize: "1.1rem" }}>{data.description}</p>
      <p className="price">{(data.price_minor / 100).toFixed(2)}</p>
      {data.available ? <a className="btn solid" href="/menu">Add from the menu</a> : <p>Currently sold out.</p>}
    </main>
  );
}
