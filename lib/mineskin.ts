import { setTimeout as sleep } from "node:timers/promises";
import { AppError } from "./errors";
import { generateAnySkinCommand } from "./anyskin";
import type { GenerationStatus, Result, Skin, Variant } from "./types";

const BASE = "https://api.mineskin.org";
const TIMEOUT = 85_000;
const MAX_ATTEMPTS = 70;
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const string = (value: unknown): string => typeof value === "string" ? value : "";
let cooldownUntil = 0;

export function retryDelay(headers: Headers, body: Json, now = Date.now()): number {
  const raw = headers.get("retry-after");
  const headerDelay = raw ? (/^\d+(\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - now) : 0;
  const next = object(object(body.rateLimit).next);
  const relative = typeof next.relative === "number" ? next.relative : 0;
  const absolute = typeof next.absolute === "number" ? next.absolute - now : 0;
  return Math.max(0, Number.isFinite(headerDelay) ? headerDelay : 0, Number.isFinite(relative) ? relative : 0, Number.isFinite(absolute) ? absolute : 0);
}

export function normalizeSkin(raw: unknown, variant: Variant): Skin {
  const skin = object(raw);
  const texture = object(skin.texture);
  const data = object(texture.data);
  const textureUrl = string(object(texture.url).skin);
  const textureHash = string(object(texture.hash).skin);
  if (skin.variant !== variant) throw new AppError("MINESKIN_ERROR", "MineSkin returned a different model. Please try again.", 502);
  if (!/^https?:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/i.test(textureUrl) || !textureHash || !string(data.value) || !string(data.signature)) {
    throw new AppError("MINESKIN_ERROR", "MineSkin returned incomplete signed texture data.", 502);
  }
  return { uuid: string(skin.uuid) || null, variant, textureUrl, textureHash, value: string(data.value), signature: string(data.signature) };
}

export async function generateSkin(file: File, variant: Variant, apiKey: string, onStatus: (status: GenerationStatus) => void, requestSignal: AbortSignal): Promise<Result> {
  if (Date.now() < cooldownUntil) throw new AppError("MINESKIN_RATE_LIMIT", "MineSkin rate limit reached. Please try again shortly.", 429, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const timeout = AbortSignal.timeout(TIMEOUT);
  const signal = AbortSignal.any([requestSignal, timeout]);
  const headers = { Authorization: `Bearer ${apiKey}`, "MineSkin-User-Agent": "AnySkinConverter/1.0", Accept: "application/json" };
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${BASE}${path}`, { ...init, headers, signal, cache: "no-store", redirect: "error" });
    let body: Json;
    try { body = object(await response.json()); }
    catch { body = {}; }
    const delay = retryDelay(response.headers, body);
    if (response.status === 429) {
      const retryAfter = Math.max(1, Math.ceil((delay || 10_000) / 1000));
      cooldownUntil = Date.now() + retryAfter * 1000;
      throw new AppError("MINESKIN_RATE_LIMIT", "MineSkin rate limit reached. Please try again shortly.", 429, retryAfter);
    }
    if (!response.ok || body.success === false) {
      const message = response.status === 401 || response.status === 403 ? "MineSkin authentication failed. Check the server API key." : response.status === 400 ? "MineSkin rejected the skin. Check the PNG and try again." : "MineSkin could not process this skin. Please try again.";
      throw new AppError("MINESKIN_ERROR", message, 502);
    }
    return { body, delay };
  };
  try {
    onStatus("uploading");
    const form = new FormData();
    form.set("file", file, "skin.png");
    form.set("variant", variant);
    form.set("visibility", "unlisted");
    let { body, delay } = await request("/v2/queue", { method: "POST", body: form });
    for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
      const job = object(body.job);
      if (job.status === "failed") throw new AppError("GENERATION_FAILED", "MineSkin generation failed. Please try another skin.", 502);
      if (body.skin) {
        const skin = normalizeSkin(body.skin, variant);
        return { success: true, skin, anyskin: { command: generateAnySkinCommand(skin.textureUrl) } };
      }
      const jobId = string(job.id);
      if (!jobId || !["waiting", "active", "unknown", "completed"].includes(string(job.status))) throw new AppError("MINESKIN_ERROR", "MineSkin returned an invalid queue response.", 502);
      if (attempt === MAX_ATTEMPTS) break;
      onStatus(job.status === "waiting" ? "queued" : "processing");
      await sleep(Math.max(1000, delay), undefined, { signal });
      ({ body, delay } = await request(`/v2/queue/${encodeURIComponent(jobId)}`));
    }
    throw new AppError("MINESKIN_TIMEOUT", "MineSkin generation timed out. Please try again later.", 504);
  } catch (error) {
    if (timeout.aborted) throw new AppError("MINESKIN_TIMEOUT", "MineSkin generation timed out. Please try again later.", 504);
    if (error instanceof AppError) throw error;
    throw new AppError("MINESKIN_ERROR", "Unable to reach MineSkin. Please try again later.", 502);
  }
}
