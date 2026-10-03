import type { Failure } from "./types";
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryAfter?: number) {
    super(message);
  }
}
export function asFailure(error: unknown): Failure {
  return { success: false, error: error instanceof AppError
    ? { code: error.code, message: error.message, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) }
    : { code: "GENERATION_FAILED", message: "Unable to generate the skin. Please try again." } };
}
