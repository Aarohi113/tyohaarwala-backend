const env = require('../config/env');
const { verifyWebhookHmac } = require('../utils/cryptoUtils');
const logger = require('../utils/logger');

/**
 * Middleware to verify Shopify Webhook requests.
 * Reads X-Shopify-Hmac-Sha256 header and compares with calculated HMAC of req.rawBody.
 */
function verifyWebhook(req, res, next) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const shopHeader = req.get('X-Shopify-Shop-Domain');
  const topicHeader = req.get('X-Shopify-Topic');

  if (!hmacHeader) {
    logger.warn('Webhook request rejected: missing X-Shopify-Hmac-Sha256 header');
    return res.status(401).json({
      success: false,
      error: 'Missing Shopify HMAC signature header'
    });
  }

  // Ensure rawBody was captured during request reception
  if (!req.rawBody) {
    logger.error('Webhook verification failed: rawBody buffer was not captured');
    return res.status(500).json({
      success: false,
      error: 'Server misconfiguration: raw webhook body was not captured'
    });
  }

  const isValid = verifyWebhookHmac(req.rawBody, hmacHeader, env.SHOPIFY_API_SECRET);

  if (!isValid) {
    logger.warn('Webhook request rejected: invalid HMAC signature', {
      shop: shopHeader,
      topic: topicHeader
    });
    return res.status(401).json({
      success: false,
      error: 'Webhook HMAC verification failed'
    });
  }

  req.webhookShop = shopHeader;
  req.webhookTopic = topicHeader;

  next();
}

module.exports = verifyWebhook;

