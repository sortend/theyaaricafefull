export const metadata = { title: "The Yaari Café — Admin" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ margin: 0, background: "#1c1410", color: "#f3e9d7", fontFamily: "Georgia, serif" }}>
    <nav aria-label="Admin" style={{ display: "flex", gap: 20, padding: "14px 24px", borderBottom: "1px solid #c9a66b55" }}>
      {[["/", "Orders"], ["/categories", "Categories"], ["/menu", "Menu"], ["/inventory", "Inventory"], ["/recipes", "Recipes"], ["/options", "Options"], ["/reservations", "Reservations"], ["/staff", "Staff"]].map(([h, l]) => <a key={h} href={h} style={{ color: "#c9a66b" }}>{l}</a>)}
    </nav>{children}</body></html>;
}

export const dynamic = "force-dynamic"; // pages read live Supabase data; never prerender
