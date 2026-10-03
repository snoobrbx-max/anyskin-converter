"use client";
import { useEffect, useRef } from "react";
import type { Variant } from "@/lib/types";
export function SkinPreview({ url, variant }: { url: string; variant: Variant }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = new Image();
    let canceled = false;
    image.onload = () => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx || canceled) return;
      ctx.clearRect(0, 0, 32, 40);
      ctx.imageSmoothingEnabled = false;
      const arm = variant === "slim" ? 3 : 4;
      const part = (sx: number, sy: number, w: number, h: number, x: number, y: number) => ctx.drawImage(image, sx, sy, w, h, x, y, w, h);
      part(8, 8, 8, 8, 12, 4); part(40, 8, 8, 8, 12, 4);
      part(20, 20, 8, 12, 12, 12); part(20, 36, 8, 12, 12, 12);
      part(44, 20, arm, 12, 12 - arm, 12); part(44, 36, arm, 12, 12 - arm, 12);
      part(36, 52, arm, 12, 20, 12); part(52, 52, arm, 12, 20, 12);
      part(4, 20, 4, 12, 12, 24); part(4, 36, 4, 12, 12, 24);
      part(20, 52, 4, 12, 16, 24); part(4, 52, 4, 12, 16, 24);
    };
    image.src = url;
    return () => { canceled = true; };
  }, [url, variant]);
  return <div className="skin-preview"><canvas ref={canvas} width={32} height={40} aria-label={`${variant} skin front preview`} role="img" /><span>FRONT VIEW · {variant.toUpperCase()}</span></div>;
}
