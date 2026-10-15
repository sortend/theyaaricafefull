import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "The Yaari Café — Fine coffee, warm company", description: "Order online from The Yaari Café." };
export const dynamic = "force-dynamic"; // pages read live Supabase data; never prerender

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>
      <nav className="nav" aria-label="Main"><a href="/" className="logo">The <b>Yaari</b> Café</a>
        <div><a className="link" href="/menu">Menu</a><a className="link" href="/gallery">Gallery</a><a className="link" href="/reserve">Reserve</a><a className="link" href="/orders">Orders</a><a className="link" href="/profile">Account</a></div></nav>
      {children}
      <footer className="footer"><a href="/about">About</a> · <a href="/faq">FAQ</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a><br />© The Yaari Café</footer>
    </body></html>
  );
}
