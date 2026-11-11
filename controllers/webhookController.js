const { LINE_ITEM_PROPERTIES } = require('../config/constants');
const tokenStorageService = require('../services/tokenStorageService');
const logger = require('../utils/logger');

// Set of processed order IDs for idempotency (in-memory with maximum capacity)
const processedOrderIds = new Set();
const MAX_PROCESSED_CACHE = 5000;

function markOrderProcessed(orderId) {
  if (processedOrderIds.size >= MAX_PROCESSED_CACHE) {
    // Delete oldest entries
    const firstItem = processedOrderIds.values().next().value;
    processedOrderIds.delete(firstItem);
  }
  processedOrderIds.add(String(orderId));
}

function isOrderProcessed(orderId) {
  return processedOrderIds.has(String(orderId));
}

/**
 * Controller for Shopify order creation webhook (`orders/create`).
 * Shopify requires a 200 OK response within 5 seconds.
 */
function handleOrderCreate(req, res) {
  const shop = req.webhookShop;
  const topic = req.webhookTopic;

  let order;
  try {
    order = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    logger.error('Failed to parse webhook JSON body', { error: err.message });
    return res.status(400).json({ success: false, error: 'Malformed JSON payload' });
  }

  const orderId = order.id || order.admin_graphql_api_id;

  if (!orderId) {
    logger.warn('Webhook payload missing order ID', { shop, topic });
    return res.status(200).json({ received: true });
  }

  // Idempotency check: avoid double processing if Shopify retries the webhook
  if (isOrderProcessed(orderId)) {
    logger.info(`Order ${orderId} already processed (idempotency key matched). Skipping.`);
    return res.status(200).json({ received: true, alreadyProcessed: true });
  }

  markOrderProcessed(orderId);

  // Scan line items for customizer design properties
  const customizedItems = [];
  const lineItems = order.line_items || [];

  for (const item of lineItems) {
    const properties = item.properties || [];
    const propMap = {};

    // Properties can be array of { name, value } or key-value object
    if (Array.isArray(properties)) {
      properties.forEach((p) => {
        if (p && p.name) {
          propMap[p.name] = p.value;
        }
      });
    } else if (typeof properties === 'object') {
      Object.assign(propMap, properties);
    }

    const designId = propMap[LINE_ITEM_PROPERTIES.DESIGN_ID];
    const frontUrl = propMap[LINE_ITEM_PROPERTIES.FRONT_DESIGN_URL];
    const backUrl = propMap[LINE_ITEM_PROPERTIES.BACK_DESIGN_URL];
    const metaUrl = propMap[LINE_ITEM_PROPERTIES.META_URL];

    if (designId || frontUrl || backUrl) {
      customizedItems.push({
        lineItemId: item.id,
        title: item.title,
        variantId: item.variant_id,
        quantity: item.quantity,
        designId,
        frontUrl,
        backUrl,
        metaUrl,
        color: propMap[LINE_ITEM_PROPERTIES.COLOR] || null,
        size: propMap[LINE_ITEM_PROPERTIES.SIZE] || null
      });
    }
  }

  logger.info(`Order ${orderId} received from ${shop}. Custom design items found: ${customizedItems.length}`, {
    orderName: order.name,
    customizedItems
  });

  return res.status(200).json({
    received: true,
    orderId,
    customizedItemsCount: customizedItems.length
  });
}

/**
 * Controller for Shopify app uninstall webhook (`app/uninstalled`).
 * Automatically revokes and deletes the stored offline access token.
 */
function handleAppUninstalled(req, res) {
  const shop = req.webhookShop;
  logger.info(`App uninstalled webhook received for shop: ${shop}`);

  if (shop) {
    tokenStorageService.deleteToken(shop);
  }

  return res.status(200).json({ received: true, uninstalled: true });
}

module.exports = {
  handleOrderCreate,
  handleAppUninstalled,
  isOrderProcessed,
  markOrderProcessed,
  processedOrderIds
};

