"use client";
import { useEffect, useRef, useState } from "react";
import type { Failure, Result, StreamEvent, Variant } from "@/lib/types";
import { VariantSelector } from "./VariantSelector";
import { SkinPreview } from "./SkinPreview";
import { ResultCard } from "./ResultCard";
import { StatusIndicator, type Status } from "./StatusIndicator";

export function SkinUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [variant, setVariant] = useState<Variant>("slim");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const selection = useRef(0);
  const busy = ["validating", "uploading", "queued", "processing"].includes(status);
  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000)));
    const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [retryUntil]);

  async function choose(candidate?: File) {
    if (!candidate || busy) return;
    const id = ++selection.current;
    setResult(null); setError(""); setStatus("validating"); setFile(null); setUrl("");
    try {
      if (candidate.size > 1024 * 1024) throw new Error("File is too large. Maximum size is 1 MB.");
      const bytes = new Uint8Array(await candidate.slice(0, 8).arrayBuffer());
      if ([137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)) throw new Error("Only PNG files are supported.");
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(candidate); } catch { throw new Error("Invalid or corrupted PNG."); }
      const valid = bitmap.width === 64 && bitmap.height === 64; bitmap.close();
      if (!valid) throw new Error("Skin must be 64x64.");
      if (id === selection.current) { setFile(candidate); setUrl(URL.createObjectURL(candidate)); setStatus("idle"); }
    } catch (e) { if (id === selection.current) { setError(e instanceof Error ? e.message : "Invalid PNG."); setStatus("error"); } }
  }
  function fail(failure: Failure) {
    if (failure.error.retryAfter) { setRetryUntil(Date.now() + failure.error.retryAfter * 1000); setRemaining(failure.error.retryAfter); }
    setError(failure.error.message); setStatus("error");
  }
  async function generate() {
    if (!file || busy || remaining) return;
    setError(""); setResult(null); setStatus("uploading");
    const controller = new AbortController(); active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 100_000);
    try {
      const form = new FormData(); form.set("file", file); form.set("variant", variant);
      const response = await fetch("/api/skin", { method: "POST", body: form, signal: controller.signal });
      if (!response.ok) { fail(await response.json() as Failure); return; }
      if (!response.body) throw new Error("No response from the server. Please try again.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let finished = false;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === "status") setStatus(event.status);
        if (event.type === "result") { setResult(event.data); setStatus("success"); finished = true; }
        if (event.type === "error") { fail(event.data); finished = true; }
      };
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume);
        }
        buffer += decoder.decode(); consume(buffer);
      } finally { reader.releaseLock(); }
      if (!finished) throw new Error("Connection ended before generation completed. Please try again.");
    } catch (e) {
      setError(controller.signal.aborted ? "Generation timed out. Please try again later." : e instanceof Error ? e.message : "Unable to generate your skin."); setStatus("error");
    } finally { clearTimeout(timeout); active.current = null; }
  }

  return <div className="workspace"><section className="card upload-card" aria-labelledby="upload-title"><div className="card-heading"><h2 id="upload-title">Create a texture</h2><span className="pill">PNG → TEXTURE</span></div><div className="section-label">01 <span>Upload your skin</span></div>
    <input ref={input} type="file" accept="image/png,.png" className="sr-only" aria-label="Select Minecraft skin PNG" disabled={busy} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
    <div className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length !== 1) { setError("Upload one skin PNG at a time."); return; } void choose(e.dataTransfer.files[0]); }}>
      {file && url ? <><SkinPreview url={url} variant={variant} /><div className="file-info"><strong title={file.name}>{file.name}</strong><span>64 × 64 px · {(file.size / 1024).toFixed(1)} KB</span><div className="file-actions"><button type="button" disabled={busy} onClick={() => input.current?.click()}>Replace</button><button type="button" disabled={busy} onClick={() => { setFile(null); setUrl(""); setResult(null); setError(""); setStatus("idle"); }}>Remove</button></div></div></> : <button type="button" className="upload-target" disabled={busy} onClick={() => input.current?.click()}><span className="upload-icon" aria-hidden="true">↑</span><strong>Drop your skin here</strong><span>or <em>browse files</em></span><small>PNG · 64 × 64 pixels · up to 1 MB</small></button>}
    </div>
    <VariantSelector value={variant} disabled={busy} onChange={v => { setVariant(v); setResult(null); setError(""); setStatus("idle"); }} />
    <button className="generate-button" type="button" disabled={!file || busy || remaining > 0} onClick={() => void generate()}>{busy ? "Generating…" : remaining ? `Try again in ${remaining}s` : "Generate Skin"}<span aria-hidden="true">✧</span></button>
    <StatusIndicator status={status} />{error && <div className="error-message" role="alert">{error}</div>}
    <p className="privacy-note">Your PNG is sent to MineSkin for generation. This app does not store uploads.</p>
  </section><ResultCard result={result} /></div>;
}
