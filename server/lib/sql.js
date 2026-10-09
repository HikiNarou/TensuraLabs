/** SQL helpers shared by repositories. */
export function paginate(total, page, pageSize) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escapes LIKE wildcards; use together with ESCAPE '\'. */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Converts SQLite aggregate values (may be null/BigInt) to plain numbers. */
export const num = (value) => Number(value ?? 0);

/** Builds a "?, ?, ?" placeholder list for IN (...) clauses. */
export const placeholders = (count) => Array.from({ length: count }, () => '?').join(', ');
