export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options: { code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options.code ?? "HTTP_ERROR";
    this.details = options.details;
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, { code: "VALIDATION_ERROR", details });
    this.name = "ValidationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
