const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const verifyWebhook = require('../middleware/verifyWebhook');

/**
 * Shopify Webhook for order creation.
 * Endpoint: POST /api/webhooks/orders-create
 */
router.post('/orders-create', verifyWebhook, webhookController.handleOrderCreate);

/**
 * Shopify Webhook for app uninstallation.
 * Endpoint: POST /api/webhooks/app-uninstalled
 */
router.post('/app-uninstalled', verifyWebhook, webhookController.handleAppUninstalled);

module.exports = router;

