export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Permintaan tidak valid', details) {
    return new HttpError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Autentikasi diperlukan') {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Akses ditolak') {
    return new HttpError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Data tidak ditemukan') {
    return new HttpError(404, 'NOT_FOUND', message);
  }

  static conflict(message = 'Data sudah ada') {
    return new HttpError(409, 'CONFLICT', message);
  }

  static unsupportedMediaType(message = 'Content-Type harus application/json') {
    return new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
  }
}
