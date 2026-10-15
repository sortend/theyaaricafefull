"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export function AutoRefresh() { const r = useRouter(); useEffect(() => { let n = 0; const t = setInterval(() => { r.refresh(); if (++n >= 10) clearInterval(t); }, 3000); return () => clearInterval(t); }, [r]); return null; }
