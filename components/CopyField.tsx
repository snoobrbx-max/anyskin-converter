"use client";
import { useEffect, useRef, useState } from "react";
export function CopyField({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  const [state, setState] = useState("Copy");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setState("Copied!"); }
    catch { setState("Select to copy"); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("Copy"), 2200);
  }
  return <div className={`copy-field ${primary ? "primary-field" : ""}`}><div className="field-heading"><span>{label}</span><button type="button" className="copy-button" onClick={copy} aria-label={`${state} ${label}`}>{state}</button></div><code tabIndex={0}>{value}</code></div>;
}
