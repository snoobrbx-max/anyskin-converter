import { PNG } from "pngjs";
import { AppError } from "./errors";
import type { Variant } from "./types";
export const MAX_FILE_SIZE = 1024 * 1024;
const MAX_BODY_SIZE = MAX_FILE_SIZE + 16 * 1024;

export function validateVariant(value: unknown): Variant {
  if (value !== "slim" && value !== "classic") throw new AppError("INVALID_VARIANT", "Choose Slim or Classic.");
  return value;
}
export function validatePng(bytes: Buffer): void {
  if (bytes.length > MAX_FILE_SIZE) throw new AppError("FILE_TOO_LARGE", "File is too large. Maximum size is 1 MB.", 413);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new AppError("INVALID_FILE", "Only PNG files are supported.");
  }
  if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new AppError("INVALID_PNG", "Invalid or corrupted PNG.");
  }
  if (bytes.readUInt32BE(16) !== 64 || bytes.readUInt32BE(20) !== 64) {
    throw new AppError("INVALID_DIMENSIONS", "Skin must be 64x64.");
  }
  try {
    let offset = 8;
    let ended = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw new Error();
      const size = bytes.readUInt32BE(offset);
      if (size > bytes.length - offset - 12) throw new Error();
      const kind = bytes.toString("ascii", offset + 4, offset + 8);
      if (kind === "acTL") throw new Error();
      offset += size + 12;
      if (kind === "IEND") { ended = size === 0 && offset === bytes.length; break; }
    }
    if (!ended) throw new Error();
    const decoded = PNG.sync.read(bytes, { checkCRC: true });
    if (decoded.width !== 64 || decoded.height !== 64 || decoded.data.length !== 64 * 64 * 4) throw new Error();
  } catch {
    throw new AppError("INVALID_PNG", "Invalid or corrupted PNG.");
  }
}

export async function readUpload(request: Request): Promise<{ file: File; variant: Variant }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) throw new AppError("INVALID_FILE", "Upload a skin PNG using the file picker.");
  if (Number(request.headers.get("content-length")) > MAX_BODY_SIZE) throw new AppError("FILE_TOO_LARGE", "File is too large. Maximum size is 1 MB.", 413);
  if (!request.body) throw new AppError("INVALID_FILE", "Select a skin PNG first.");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_SIZE) { await reader.cancel(); throw new AppError("FILE_TOO_LARGE", "File is too large. Maximum size is 1 MB.", 413); }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(parts), { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new AppError("INVALID_FILE", "Invalid upload. Select a PNG and try again."); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new AppError("INVALID_FILE", "Select a skin PNG first.");
  const variant = validateVariant(form.get("variant"));
  validatePng(Buffer.from(await file.arrayBuffer()));
  return { file, variant };
}
