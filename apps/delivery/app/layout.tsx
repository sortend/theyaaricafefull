export const metadata = { title: "The Yaari Café — delivery" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ margin: 0, background: "#1c1410", color: "#f3e9d7", fontFamily: "Georgia, serif" }}>{children}</body></html>;
}

export const dynamic = "force-dynamic"; // pages read live Supabase data; never prerender
