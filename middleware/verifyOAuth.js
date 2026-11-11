const env = require('../config/env');
const { isValidShopDomain, sanitizeShopDomain } = require('../config/shopify');
const { verifyOAuthHmac } = require('../utils/cryptoUtils');
const { validateNonce } = require('../services/shopifyAuthService');
const logger = require('../utils/logger');

/**
 * Middleware to validate query params when initiating OAuth (/auth).
 */
function verifyAuthInitiation(req, res, next) {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameter: shop (e.g. your-store.myshopify.com)'
    });
  }

  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized || !isValidShopDomain(sanitized)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid shop domain format. Must be a valid *.myshopify.com domain.'
    });
  }

  req.sanitizedShop = sanitized;
  next();
}

/**
 * Middleware to verify OAuth callback query parameters and HMAC signature.
 */
function verifyAuthCallback(req, res, next) {
  const { shop, code, state, hmac } = req.query;

  if (!shop || !code || !state || !hmac) {
    logger.warn('OAuth callback rejected: missing required query parameters', { query: req.query });
    return res.status(400).json({
      success: false,
      error: 'Invalid OAuth callback: shop, code, state, and hmac are required.'
    });
  }

  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized || !isValidShopDomain(sanitized)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid shop domain in OAuth callback.'
    });
  }

  // Verify HMAC signature
  if (!verifyOAuthHmac(req.query, env.SHOPIFY_API_SECRET)) {
    logger.warn('OAuth callback rejected: HMAC signature verification failed', { shop: sanitized });
    return res.status(401).json({
      success: false,
      error: 'HMAC signature verification failed. The request may have been tampered with.'
    });
  }

  // Validate state / nonce
  if (!validateNonce(state, sanitized)) {
    logger.warn('OAuth callback rejected: state/nonce invalid or expired', { shop: sanitized });
    return res.status(403).json({
      success: false,
      error: 'OAuth state/nonce is invalid or expired. Please re-initiate installation.'
    });
  }

  req.sanitizedShop = sanitized;
  next();
}

module.exports = {
  verifyAuthInitiation,
  verifyAuthCallback
};

