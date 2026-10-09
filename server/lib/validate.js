import { HttpError } from './errors.js';

/** Parses input with a zod schema and converts failures into a 400 HttpError. */
export function parseOrThrow(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
  throw HttpError.badRequest('Data yang dikirim tidak valid', details);
}

/** Wraps async route handlers so rejected promises reach the error middleware. */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
