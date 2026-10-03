import "server-only";
import { AppError, asFailure } from "@/lib/errors";
import { generateSkin } from "@/lib/mineskin";
import { readUpload } from "@/lib/validation";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 100;
let active = 0;

export async function POST(request: Request): Promise<Response> {
  let reserved = false;
  try {
    const origin = request.headers.get("origin");
    const requestHost = request.headers.get("host") ?? new URL(request.url).host;
    let sameOrigin = !origin;
    try { if (origin) sameOrigin = ["http:", "https:"].includes(new URL(origin).protocol) && new URL(origin).host === requestHost; } catch { sameOrigin = false; }
    if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("INVALID_ORIGIN", "Cross-site uploads are not allowed.", 403);
    if (active >= 3) throw new AppError("SERVER_BUSY", "The converter is busy. Please try again shortly.", 429, 10);
    active++;
    reserved = true;
    const { file, variant } = await readUpload(request);
    const apiKey = process.env.MINESKIN_API_KEY;
    if (!apiKey || apiKey === "your_mineskin_api_key_here") throw new AppError("MINESKIN_NOT_CONFIGURED", "MineSkin API key is not configured.", 503);
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: StreamEvent) => {
          if (!signal.aborted) controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
        };
        try {
          const result = await generateSkin(file, variant, apiKey, status => send({ type: "status", status }), signal);
          send({ type: "result", data: result });
        } catch (error) { send({ type: "error", data: asFailure(error) }); }
        finally { active--; if (!signal.aborted) controller.close(); }
      },
      cancel() { abort.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (reserved) active--;
    return Response.json(asFailure(error), { status: error instanceof AppError ? error.status : 500, headers: { "Cache-Control": "no-store", ...(error instanceof AppError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
  }
}
