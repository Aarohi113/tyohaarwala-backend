const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const env = require('../config/env');
const tokenStorageService = require('../services/tokenStorageService');
const shopifyAuthService = require('../services/shopifyAuthService');

describe('Shopify Authentication & OAuth Security Tests', () => {
  const testSecret = 'test-secret-key-12345';
  const testShop = 'my-custom-store.myshopify.com';

  beforeAll(() => {
    env.SHOPIFY_API_KEY = 'test_client_id_xyz';
    env.SHOPIFY_API_SECRET = testSecret;
    env.SHOPIFY_APP_URL = 'http://localhost:3000';
  });

  describe('GET /auth (Initiation)', () => {
    it('should reject request without shop query parameter', async () => {
      const res = await request(app).get('/auth');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required query parameter: shop');
    });

    it('should reject invalid shop domain', async () => {
      const res = await request(app).get('/auth?shop=malicious-domain.com');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid shop domain format');
    });

    it('should redirect valid shop to Shopify authorize URL with state and scopes', async () => {
      const res = await request(app).get(`/auth?shop=${testShop}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`https://${testShop}/admin/oauth/authorize`);
      expect(res.headers.location).toContain(`client_id=${env.SHOPIFY_API_KEY}`);
      expect(res.headers.location).toContain('state=');
      expect(res.headers.location).toContain('scope=');
    });
  });

  describe('GET /auth/callback (OAuth Callback Security)', () => {
    it('should reject callback with missing parameters', async () => {
      const res = await request(app).get('/auth/callback?shop=' + testShop);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop, code, state, and hmac are required');
    });

    it('should reject callback with tampered or invalid HMAC', async () => {
      const res = await request(app).get(
        `/auth/callback?shop=${testShop}&code=sample_code&state=sample_state&timestamp=1234567890&hmac=invalid_hmac`
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('HMAC signature verification failed');
    });

    it('should reject callback with valid HMAC but expired/unknown state nonce', async () => {
      const queryObj = {
        code: 'sample_code_123',
        shop: testShop,
        state: 'unknown_or_expired_state',
        timestamp: '1731317500'
      };

      // Calculate valid HMAC for tampered/unknown state
      const sorted = Object.keys(queryObj)
        .sort()
        .map((k) => `${k}=${queryObj[k]}`)
        .join('&');
      const hmac = crypto.createHmac('sha256', testSecret).update(sorted).digest('hex');

      const res = await request(app).get(
        `/auth/callback?${sorted}&hmac=${hmac}`
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('OAuth state/nonce is invalid or expired');
    });

    it('should successfully exchange code for offline access token and store it', async () => {
      // 1. Generate legitimate auth session to register active nonce
      const { state } = shopifyAuthService.createAuthUrl(testShop);

      const queryObj = {
        code: 'valid_auth_code_999',
        shop: testShop,
        state: state,
        timestamp: '1731317500'
      };

      const sorted = Object.keys(queryObj)
        .sort()
        .map((k) => `${k}=${queryObj[k]}`)
        .join('&');
      const hmac = crypto.createHmac('sha256', testSecret).update(sorted).digest('hex');

      // Mock global fetch for token exchange POST
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'shpat_offline_token_test_123456789',
          scope: 'write_files,read_files,read_products'
        })
      });

      const res = await request(app).get(`/auth/callback?${sorted}&hmac=${hmac}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('App Successfully Installed');

      // Verify token was persisted
      const stored = tokenStorageService.getToken(testShop);
      expect(stored).toBe('shpat_offline_token_test_123456789');

      global.fetch = originalFetch; // restore
    });
  });

  describe('GET /auth/status', () => {
    it('should return installation status for a shop', async () => {
      tokenStorageService.storeToken(testShop, 'shpat_offline_token_test_123456789', 'write_files');
      const res = await request(app).get(`/auth/status?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.shop).toBe(testShop);
      expect(res.body.installed).toBe(true);
    });
  });
});

