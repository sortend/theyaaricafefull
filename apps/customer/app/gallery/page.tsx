import { cookies } from "next/headers";
import { serverClient } from "@yaari/database";
export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery — The Yaari Café" };

export default async function Gallery() {
  const store = serverClient(cookies()).storage.from("gallery");
  const { data } = await store.list("", { limit: 60, sortBy: { column: "created_at", order: "desc" } });
  const files = (data ?? []).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f.name));
  return (
    <main className="section" style={{ paddingTop: 140 }}>
      <p className="eyebrow">Gallery</p><h2>A look inside</h2>
      {files.length === 0 ? <p>Photos are coming soon.</p> :
        <div className="cols">{files.map((f) => <img key={f.name} src={store.getPublicUrl(f.name).data.publicUrl} alt={f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")} loading="lazy" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", border: "1px solid #c9a66b33" }} />)}</div>}
    </main>
  );
}
