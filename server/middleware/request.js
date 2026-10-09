import crypto from 'node:crypto';

/** Correlation id for every request (echoed as X-Request-Id and included in error logs). */
export function requestContext() {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}
