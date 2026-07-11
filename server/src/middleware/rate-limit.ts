import type { Request, Response, NextFunction } from 'express';

interface RateBucket {
  count: number;
  resetAt: number;
}

/**
 * Pembatas laju (rate limiter) sederhana berbasis memori per IP.
 * Cukup untuk melindungi endpoint AI dari penyalahgunaan dasar.
 * Catatan: untuk multi-instance, gunakan store terdistribusi (mis. Redis).
 */
export function createRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, RateBucket>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  if (typeof cleanup.unref === 'function') cleanup.unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Terlalu banyak permintaan. Coba lagi nanti.',
        code: 'rate_limited',
        retryAfter,
      });
      return;
    }

    next();
  };
}
