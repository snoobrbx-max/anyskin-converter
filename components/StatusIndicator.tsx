import type { GenerationStatus } from "@/lib/types";
const labels = { validating: "Validating skin…", uploading: "Uploading to MineSkin…", queued: "Queued at MineSkin…", processing: "Generating signed texture…", success: "Done — your texture is ready", idle: "Ready when you are", error: "Generation stopped" };
export type Status = GenerationStatus | "validating" | "success" | "idle" | "error";
export function StatusIndicator({ status }: { status: Status }) {
  const busy = ["validating", "uploading", "queued", "processing"].includes(status);
  return <div className={`status status-${status}`} role="status" aria-live="polite"><span className={busy ? "spinner" : "status-dot"} aria-hidden="true" />{labels[status]}</div>;
}
