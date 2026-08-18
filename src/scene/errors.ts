/**
 * Error model for Visual MCP.
 *
 * Every failure surfaced to the LLM must be a small, self-describing object.
 * We never leak stack traces or internal exception messages to the model:
 * they waste tokens and cannot be acted upon.
 */

export const ERROR_CODES = [
  "INVALID_SCENE",
  "INVALID_ELEMENT",
  "DUPLICATE_ID",
  "ELEMENT_NOT_FOUND",
  "SCENE_NOT_FOUND",
  "UNKNOWN_ELEMENT_TYPE",
  "INVALID_REFERENCE",
  "INVALID_GEOMETRY",
  "TYPE_CHANGE_NOT_ALLOWED",
  "LIMIT_EXCEEDED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface VisualErrorPayload {
  code: ErrorCode;
  /** Human-readable, actionable, addressed to an LLM. */
  message: string;
  /** Dotted path inside the offending payload, when known. e.g. `elements[3].radius`. */
  path?: string;
  /** Concrete next step the model can take. */
  hint?: string;
}

export class VisualError extends Error {
  readonly code: ErrorCode;
  readonly path?: string;
  readonly hint?: string;

  constructor(payload: VisualErrorPayload) {
    super(payload.message);
    this.name = "VisualError";
    this.code = payload.code;
    this.path = payload.path;
    this.hint = payload.hint;
  }

  toPayload(): VisualErrorPayload {
    const out: VisualErrorPayload = { code: this.code, message: this.message };
    if (this.path) out.path = this.path;
    if (this.hint) out.hint = this.hint;
    return out;
  }
}

export function visualError(
  code: ErrorCode,
  message: string,
  extra: { path?: string; hint?: string } = {},
): VisualError {
  return new VisualError({ code, message, ...extra });
}

/** Discriminated result used by every MCP tool handler. */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: VisualErrorPayload };

export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

export function fail(error: VisualErrorPayload): Result<never> {
  return { success: false, error };
}

/** Normalises anything thrown inside a tool handler into a model-safe payload. */
export function toErrorPayload(err: unknown): VisualErrorPayload {
  if (err instanceof VisualError) return err.toPayload();
  if (err instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: err.message,
      hint: "This is a bug in Visual MCP, not in your input. Try a simpler scene.",
    };
  }
  return { code: "INTERNAL_ERROR", message: String(err) };
}
