const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * General API rate limiter for storefront endpoints (App Proxy).
 */
const proxyRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this client. Please slow down.'
  }
});

/**
 * Stricter rate limiter for sensitive OAuth endpoints.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.'
  }
});

module.exports = {
  proxyRateLimiter,
  authRateLimiter
};

