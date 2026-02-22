import { ValidationError, isRecord } from "./errors.js";

export function parseOptionalIsoDate(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string datetime.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError(`${fieldName} cannot be empty.`);
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    throw new ValidationError(`${fieldName} must be a valid ISO datetime.`);
  }
  return new Date(trimmed).toISOString();
}

export function parseOptionalPositiveInt(
  value: unknown,
  fieldName: string,
  defaultValue: number,
): number {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

export function parseRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError(`${fieldName} cannot be empty.`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} exceeds max length (${maxLength}).`);
  }
  return trimmed;
}

export function parseOptionalStringArray(
  value: unknown,
  fieldName: string,
  maxItems = 100,
): string[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array of strings.`);
  }

  const output = value.map((item, index) =>
    parseRequiredString(item, `${fieldName}[${index}]`),
  );
  if (output.length > maxItems) {
    throw new ValidationError(`${fieldName} exceeds max size (${maxItems}).`);
  }
  return output;
}

export function parseRequiredObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError(`${fieldName} must be an object.`);
  }
  return value;
}
