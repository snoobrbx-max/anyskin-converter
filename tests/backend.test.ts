import { test } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { AppError } from "../lib/errors";
import { readUpload, validatePng, validateVariant } from "../lib/validation";
import { generateSkin, normalizeSkin, retryDelay } from "../lib/mineskin";
import { generateAnySkinCommand } from "../lib/anyskin";

const png = PNG.sync.write(new PNG({ width: 64, height: 64 }));
const file = new File([Uint8Array.from(png)], "skin.png", { type: "image/png" });
const rawSkin = { uuid: "test-uuid", variant: "slim", texture: { url: { skin: "https://textures.minecraft.net/texture/abcdef1234" }, hash: { skin: "abcdef1234" }, data: { value: "test-value", signature: "test-signature" } } };
const signal = () => new AbortController().signal;
const isError = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;

test("PNG validation decodes content and checks CRC, size, dimensions and truncation", () => {
  assert.doesNotThrow(() => validatePng(png));
  assert.throws(() => validatePng(Buffer.from("not an image")), isError("INVALID_FILE"));
  assert.throws(() => validatePng(PNG.sync.write(new PNG({ width: 32, height: 32 }))), isError("INVALID_DIMENSIONS"));
  assert.throws(() => validatePng(png.subarray(0, -5)), isError("INVALID_PNG"));
  const corrupt = Buffer.from(png); corrupt[29] ^= 255;
  assert.throws(() => validatePng(corrupt), isError("INVALID_PNG"));
  assert.throws(() => validatePng(Buffer.alloc(1024 * 1024 + 1)), isError("FILE_TOO_LARGE"));
});
test("upload validates actual bytes rather than trusting MIME", async () => {
  const form = new FormData(); form.set("file", new File([Uint8Array.from(png)], "skin.bin", { type: "application/octet-stream" })); form.set("variant", "classic");
  const result = await readUpload(new Request("http://localhost/api/skin", { method: "POST", body: form }));
  assert.equal(result.variant, "classic");
  assert.throws(() => validateVariant("auto"), isError("INVALID_VARIANT"));
  const empty = new FormData(); empty.set("variant", "slim");
  await assert.rejects(readUpload(new Request("http://localhost/api/skin", { method: "POST", body: empty })), isError("INVALID_FILE"));
});
test("streamed upload limits do not depend on Content-Length", async () => {
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1024 * 1024 + 20_000)); c.close(); } });
  const request = new Request("http://localhost/api/skin", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body, duplex: "half" } as RequestInit);
  await assert.rejects(readUpload(request), isError("FILE_TOO_LARGE"));
});
test("normalization refuses mismatched model, incomplete signatures and external URLs", () => {
  assert.throws(() => normalizeSkin(rawSkin, "classic"), isError("MINESKIN_ERROR"));
  assert.throws(() => normalizeSkin({ ...rawSkin, texture: {} }, "slim"), isError("MINESKIN_ERROR"));
  assert.throws(() => generateAnySkinCommand("https://example.com/texture/abc"));
});
test("rate information accepts Retry-After seconds/date and MineSkin millisecond delays", () => {
  const now = Date.now();
  assert.equal(retryDelay(new Headers({ "Retry-After": "4" }), {}, now), 4000);
  assert.equal(retryDelay(new Headers(), { rateLimit: { next: { relative: 5000, absolute: now + 6000 } } }, now), 6000);
  assert.ok(retryDelay(new Headers({ "Retry-After": new Date(now + 10_000).toUTCString() }), {}, now) >= 9000);
});
test("HTTP 200 returns completed data immediately and sends explicit model/auth", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++; assert.equal(url, "https://api.mineskin.org/v2/queue");
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer test-key");
    assert.equal((options.body as FormData).get("variant"), "slim");
    return Response.json({ success: true, skin: rawSkin });
  });
  const result = await generateSkin(file, "slim", "test-key", () => {}, signal());
  assert.equal(calls, 1); assert.equal(result.anyskin.command, `/skin ${rawSkin.texture.url.skin}`);
  assert.equal(result.skin.signature, "test-signature");
});
test("HTTP 202 polls waiting/active jobs at least one second apart", async t => {
  const calls: number[] = []; const states: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(Date.now());
    if (calls.length === 1) return Response.json({ success: true, job: { id: "job/1", status: "waiting" } }, { status: 202 });
    assert.equal(url, "https://api.mineskin.org/v2/queue/job%2F1");
    if (calls.length === 2) return Response.json({ success: true, job: { id: "job/1", status: "active" } });
    return Response.json({ success: true, job: { id: "job/1", status: "completed" }, skin: rawSkin });
  });
  const result = await generateSkin(file, "slim", "test-key", status => states.push(status), signal());
  assert.equal(result.success, true); assert.deepEqual(states, ["uploading", "queued", "processing"]);
  assert.ok(calls[1] - calls[0] >= 1000); assert.ok(calls[2] - calls[1] >= 1000);
});
test("failed and malformed jobs return safe errors", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, job: { id: "job", status: "failed" }, errors: [{ message: "private diagnostics" }] }));
  await assert.rejects(generateSkin(file, "slim", "test-key", () => {}, signal()), isError("GENERATION_FAILED"));
  fetchMock.mock.mockImplementation(async () => Response.json({ success: true }));
  await assert.rejects(generateSkin(file, "slim", "test-key", () => {}, signal()), isError("MINESKIN_ERROR"));
});
test("upstream outage does not leak error details", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("secret test-key"); });
  await assert.rejects(generateSkin(file, "slim", "test-key", () => {}, signal()), e => isError("MINESKIN_ERROR")(e) && !(e as Error).message.includes("test-key"));
});
test("429 stops immediately and honors the shared cooldown", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ success: false }, { status: 429, headers: { "Retry-After": "5" } }); });
  await assert.rejects(generateSkin(file, "slim", "test-key", () => {}, signal()), e => isError("MINESKIN_RATE_LIMIT")(e) && (e as AppError).retryAfter === 5);
  await assert.rejects(generateSkin(file, "slim", "test-key", () => {}, signal()), isError("MINESKIN_RATE_LIMIT"));
  assert.equal(calls, 1);
});

