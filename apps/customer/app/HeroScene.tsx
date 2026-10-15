"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
const Scene = dynamic(() => import("./Scene3D"), { ssr: false }); // heavy WebGL code loads only when needed

export function HeroScene() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(!matchMedia("(prefers-reduced-motion: reduce)").matches && innerWidth >= 768); }, []);
  if (!on) return null; // mobile / reduced-motion: CSS hero only
  return <div aria-hidden="true" style={{ position: "absolute", right: "-2vw", bottom: "-4vh", width: "46vw", height: "72vh", zIndex: 0, pointerEvents: "none" }}><Scene /></div>;
}
