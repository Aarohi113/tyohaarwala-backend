const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const env = require('../config/env');
const tokenStorageService = require('../services/tokenStorageService');

describe('Shopify App Proxy Signature & Security Tests', () => {
  const testSecret = 'proxy-secret-key-999';
  const testShop = 'proxy-test-store.myshopify.com';

  beforeAll(() => {
    env.SHOPIFY_API_SECRET = testSecret;
    // Register token for shop
    tokenStorageService.storeToken(testShop, 'shpat_proxy_token_123', 'write_files');
  });

  function generateProxyQuery(params, secret = testSecret) {
    const query = {
      path_prefix: '/apps/product-designer',
      shop: testShop,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...params
    };

    // App Proxy signature algorithm: sort keys, join key=val with no separator, HMAC-SHA256 hex
    const sortedString = Object.keys(query)
      .sort()
      .map((k) => `${k}=${query[k]}`)
      .join('');

    const signature = crypto.createHmac('sha256', secret).update(sortedString).digest('hex');

    return { ...query, signature };
  }

  it('should reject request without signature', async () => {
    const res = await request(app).post('/api/proxy/upload-design?shop=' + testShop);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('missing App Proxy signature');
  });

  it('should reject request with expired timestamp (>300s drift)', async () => {
    const expiredTimestamp = String(Math.floor(Date.now() / 1000) - 400); // 400s ago
    const query = generateProxyQuery({ timestamp: expiredTimestamp });

    const queryStr = new URLSearchParams(query).toString();
    const res = await request(app).post(`/api/proxy/upload-design?${queryStr}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('App Proxy request expired');
  });

  it('should reject request with invalid HMAC signature', async () => {
    const query = generateProxyQuery({ foo: 'bar' }, 'wrong-secret');
    const queryStr = new URLSearchParams(query).toString();

    const res = await request(app).post(`/api/proxy/upload-design?${queryStr}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid App Proxy signature');
  });

  it('should reject request if shop has no installed access token', async () => {
    const uninstalledShop = 'uninstalled-store.myshopify.com';
    const query = generateProxyQuery({ shop: uninstalledShop });
    const queryStr = new URLSearchParams(query).toString();

    const res = await request(app).post(`/api/proxy/upload-design?${queryStr}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('App is not installed on this store');
  });
});

