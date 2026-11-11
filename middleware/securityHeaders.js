const helmet = require('helmet');

/**
 * Configures HTTP security headers.
 * Permits Shopify Admin embedding if necessary, while enforcing strict headers elsewhere.
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameAncestors: [
        "'self'",
        'https://*.myshopify.com',
        'https://admin.shopify.com'
      ],
      imgSrc: ["'self'", 'data:', 'https://cdn.shopify.com', 'https://*.shopifycdn.com'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

module.exports = securityHeaders;

