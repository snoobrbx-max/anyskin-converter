export type Variant = "slim" | "classic";
export type GenerationStatus = "uploading" | "queued" | "processing";
export interface Skin {
  uuid: string | null;
  variant: Variant;
  textureUrl: string;
  textureHash: string;
  value: string;
  signature: string;
}
export interface Result {
  success: true;
  skin: Skin;
  anyskin: { command: string };
}
export interface Failure {
  success: false;
  error: { code: string; message: string; retryAfter?: number };
}
export type StreamEvent = { type: "status"; status: GenerationStatus } | { type: "result"; data: Result } | { type: "error"; data: Failure };
