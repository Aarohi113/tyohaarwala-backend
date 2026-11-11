const env = require('../config/env');
const { APP_PROXY } = require('../config/constants');
const { isValidShopDomain, sanitizeShopDomain } = require('../config/shopify');
const { verifyAppProxySignature } = require('../utils/cryptoUtils');
const tokenStorageService = require('../services/tokenStorageService');
const logger = require('../utils/logger');

/**
 * Middleware that validates Shopify App Proxy requests.
 * Verifies:
 * 1. shop parameter presence and format
 * 2. timestamp freshness (mitigating replay attacks)
 * 3. cryptographic signature calculated using app client secret
 * 4. availability of active Shopify Admin access token for this shop
 */
function verifyAppProxy(req, res, next) {
  const { signature, shop, timestamp } = req.query;

  // 1. Signature presence
  if (!signature) {
    logger.warn('App Proxy request rejected: missing signature parameter');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: missing App Proxy signature'
    });
  }

  // 2. Shop domain validation
  const sanitizedShop = sanitizeShopDomain(shop);
  if (!sanitizedShop || !isValidShopDomain(sanitizedShop)) {
    logger.warn('App Proxy request rejected: invalid or missing shop parameter', { shop });
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing shop domain'
    });
  }

  // 3. Timestamp validation
  if (!timestamp) {
    logger.warn('App Proxy request rejected: missing timestamp');
    return res.status(400).json({
      success: false,
      error: 'Missing timestamp parameter'
    });
  }

  const parsedTimestamp = parseInt(timestamp, 10);
  if (isNaN(parsedTimestamp)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid timestamp format'
    });
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(currentEpochSeconds - parsedTimestamp);

  if (timeDifference > APP_PROXY.MAX_TIMESTAMP_DRIFT_SECONDS) {
    logger.warn('App Proxy request rejected: timestamp expired / clock drift exceeded', {
      timestamp: parsedTimestamp,
      currentEpochSeconds,
      diff: timeDifference
    });
    return res.status(401).json({
      success: false,
      error: 'App Proxy request expired. Signature timestamp is outside the allowed window.'
    });
  }

  // 4. Cryptographic signature check
  const isValidSignature = verifyAppProxySignature(req.query, env.SHOPIFY_API_SECRET);
  if (!isValidSignature) {
    logger.warn('App Proxy request rejected: invalid signature calculation', { shop: sanitizedShop });
    return res.status(401).json({
      success: false,
      error: 'Invalid App Proxy signature'
    });
  }

  // 5. Check offline access token
  const accessToken = tokenStorageService.getToken(sanitizedShop);
  if (!accessToken) {
    logger.error('App Proxy request failed: no access token found for shop', { shop: sanitizedShop });
    return res.status(401).json({
      success: false,
      error: 'App is not installed on this store or offline access token is missing. Please complete app installation.'
    });
  }

  // Attach verified context to request
  req.shop = sanitizedShop;
  req.shopifyAccessToken = accessToken;

  next();
}

module.exports = verifyAppProxy;

