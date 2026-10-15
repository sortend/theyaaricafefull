"use client";
import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useState } from "react";
const Scene = dynamic(() => import("./Scene3D"), { ssr: false }); // heavy WebGL code loads only when needed

// If WebGL fails for any reason, the 3D scene disappears quietly instead of crashing the page.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };

export function HeroScene() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(!matchMedia("(prefers-reduced-motion: reduce)").matches && innerWidth >= 768 && hasWebGL()); }, []);
  if (!on) return null; // mobile / reduced-motion / no WebGL: CSS hero only
  return <div aria-hidden="true" style={{ position: "absolute", right: "-2vw", bottom: "-4vh", width: "46vw", height: "72vh", zIndex: 0, pointerEvents: "none" }}><Boundary><Scene /></Boundary></div>;
}
