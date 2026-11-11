const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const env = require('../config/env');
const { processedOrderIds } = require('../controllers/webhookController');

describe('Shopify Webhook Security & Order Processing Tests', () => {
  const webhookSecret = 'webhook-secret-xyz';
  const testShop = 'webhook-store.myshopify.com';

  beforeAll(() => {
    env.SHOPIFY_API_SECRET = webhookSecret;
  });

  beforeEach(() => {
    processedOrderIds.clear();
  });

  function calculateWebhookHmac(rawString, secret = webhookSecret) {
    return crypto.createHmac('sha256', secret).update(rawString).digest('base64');
  }

  const sampleOrderPayload = {
    id: 5544332211,
    name: '#1001',
    line_items: [
      {
        id: 99887766,
        title: 'Customized Premium Hoodie',
        variant_id: 112233,
        quantity: 1,
        properties: [
          { name: '_custom_design_id', value: 'des_test_987654' },
          { name: 'Front Design URL', value: 'https://cdn.shopify.com/files/front.png' },
          { name: 'Back Design URL', value: 'https://cdn.shopify.com/files/back.png' },
          { name: 'Selected color', value: 'Navy' },
          { name: 'Selected size', value: 'XL' }
        ]
      }
    ]
  };

  it('should reject webhook request missing X-Shopify-Hmac-Sha256 header', async () => {
    const res = await request(app)
      .post('/api/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .send(sampleOrderPayload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Missing Shopify HMAC signature header');
  });

  it('should reject webhook request with invalid HMAC header', async () => {
    const rawBody = JSON.stringify(sampleOrderPayload);

    const res = await request(app)
      .post('/api/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', 'invalid_base64_hmac')
      .set('X-Shopify-Shop-Domain', testShop)
      .set('X-Shopify-Topic', 'orders/create')
      .send(rawBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Webhook HMAC verification failed');
  });

  it('should accept valid webhook, verify HMAC, and extract customized line items', async () => {
    const rawBody = JSON.stringify(sampleOrderPayload);
    const validHmac = calculateWebhookHmac(rawBody);

    const res = await request(app)
      .post('/api/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', validHmac)
      .set('X-Shopify-Shop-Domain', testShop)
      .set('X-Shopify-Topic', 'orders/create')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.orderId).toBe(sampleOrderPayload.id);
    expect(res.body.customizedItemsCount).toBe(1);
  });

  it('should handle webhook idempotently on repeated deliveries', async () => {
    const rawBody = JSON.stringify(sampleOrderPayload);
    const validHmac = calculateWebhookHmac(rawBody);

    // First delivery
    const res1 = await request(app)
      .post('/api/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', validHmac)
      .send(rawBody);
    expect(res1.status).toBe(200);
    expect(res1.body.customizedItemsCount).toBe(1);

    // Second delivery of same order (Shopify retry)
    const res2 = await request(app)
      .post('/api/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', validHmac)
      .send(rawBody);

    expect(res2.status).toBe(200);
    expect(res2.body.alreadyProcessed).toBe(true);
  });

  it('should handle app/uninstalled webhook and delete offline access token', async () => {
    const tokenStorageService = require('../services/tokenStorageService');
    tokenStorageService.storeToken(testShop, 'shpat_to_be_deleted', 'write_files');
    expect(tokenStorageService.hasToken(testShop)).toBe(true);

    const payload = { id: 12345, domain: testShop };
    const rawBody = JSON.stringify(payload);
    const validHmac = calculateWebhookHmac(rawBody);

    const res = await request(app)
      .post('/api/webhooks/app-uninstalled')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', validHmac)
      .set('X-Shopify-Shop-Domain', testShop)
      .set('X-Shopify-Topic', 'app/uninstalled')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body.uninstalled).toBe(true);
    expect(tokenStorageService.hasToken(testShop)).toBe(false);
  });
});

