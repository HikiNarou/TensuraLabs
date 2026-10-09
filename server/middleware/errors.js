import { HttpError } from '../lib/errors.js';

export function notFoundApi(_req, _res, next) {
  next(HttpError.notFound('Endpoint tidak ditemukan'));
}

/** Central error handler: never leaks stack traces or internal messages to clients. */
export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, _next) => {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Body JSON tidak valid' } });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran data terlalu besar' } });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    }
    logger.error({ err: error, method: req.method, path: req.path, requestId: req.id }, 'Unhandled error');
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server', requestId: req.id } });
  };
}
