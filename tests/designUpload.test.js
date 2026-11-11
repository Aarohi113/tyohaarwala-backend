const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const env = require('../config/env');
const tokenStorageService = require('../services/tokenStorageService');
const shopifyValidationService = require('../services/shopifyValidationService');
const shopifyFilesService = require('../services/shopifyFilesService');

describe('Design Upload & Shopify Files API Tests', () => {
  const testSecret = 'design-secret-456';
  const testShop = 'designer-store.myshopify.com';
  const testAccessToken = 'shpat_design_token_abc';

  const validPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  beforeAll(() => {
    env.SHOPIFY_API_SECRET = testSecret;
    tokenStorageService.storeToken(testShop, testAccessToken, 'write_files');
  });

  function getSignedProxyQuery(params = {}) {
    const query = {
      path_prefix: '/apps/product-designer',
      shop: testShop,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...params
    };

    const sortedString = Object.keys(query)
      .sort()
      .map((k) => `${k}=${query[k]}`)
      .join('');

    const signature = crypto.createHmac('sha256', testSecret).update(sortedString).digest('hex');
    return new URLSearchParams({ ...query, signature }).toString();
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return 400 when front or back design is missing', async () => {
    const queryStr = getSignedProxyQuery();

    const res = await request(app)
      .post(`/api/proxy/upload-design?${queryStr}`)
      .send({
        productId: '12345',
        variantId: '67890',
        frontImage: validPngDataUrl
        // backImage missing
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required back design image');
  });

  it('should return 400 when an image has invalid content (not genuine PNG)', async () => {
    const queryStr = getSignedProxyQuery();

    const res = await request(app)
      .post(`/api/proxy/upload-design?${queryStr}`)
      .send({
        productId: '12345',
        variantId: '67890',
        frontImage: validPngDataUrl,
        backImage: 'data:image/png;base64,bm90IGEgcG5nIGZpbGUgYXQgYWxs' // "not a png file at all"
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('must be a genuine PNG file');
  });

  it('should return 400 when productId or variantId is missing', async () => {
    const queryStr = getSignedProxyQuery();

    const res = await request(app)
      .post(`/api/proxy/upload-design?${queryStr}`)
      .send({
        frontImage: validPngDataUrl,
        backImage: validPngDataUrl
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Both productId and variantId are required');
  });

  it('should return 400 when Shopify GraphQL product/variant validation fails', async () => {
    const queryStr = getSignedProxyQuery();

    jest.spyOn(shopifyValidationService, 'validateProductAndVariant').mockResolvedValue({
      valid: false,
      error: 'Product variant not found on store: 999999'
    });

    const res = await request(app)
      .post(`/api/proxy/upload-design?${queryStr}`)
      .send({
        productId: '12345',
        variantId: '999999',
        frontImage: validPngDataUrl,
        backImage: validPngDataUrl
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Product variant not found on store');
  });

  it('should handle Shopify Files API errors gracefully (userErrors)', async () => {
    const queryStr = getSignedProxyQuery();

    jest.spyOn(shopifyValidationService, 'validateProductAndVariant').mockResolvedValue({
      valid: true,
      product: { id: 'gid://shopify/Product/123' },
      variant: { id: 'gid://shopify/ProductVariant/456' }
    });

    jest.spyOn(shopifyFilesService, 'uploadBufferToShopifyFiles').mockRejectedValue(
      new Error('Shopify stagedUploadsCreate failed: File size exceeds merchant plan limits')
    );

    const res = await request(app)
      .post(`/api/proxy/upload-design?${queryStr}`)
      .send({
        productId: '123',
        variantId: '456',
        frontImage: validPngDataUrl,
        backImage: validPngDataUrl
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('File size exceeds merchant plan limits');
  });

  it('should successfully upload front/back images, create metadata manifest in Shopify Files, and return cart properties', async () => {
    const queryStr = getSignedProxyQuery();

    // 1. Mock product & variant validation
    jest.spyOn(shopifyValidationService, 'validateProductAndVariant').mockResolvedValue({
      valid: true,
      product: { id: 'gid://shopify/Product/12345', title: 'Custom T-Shirt' },
      variant: { id: 'gid://shopify/ProductVariant/67890', title: 'Black / L' }
    });

    // 2. Mock uploadBufferToShopifyFiles calls (front, back, and metadata manifest)
    let callCount = 0;
    jest.spyOn(shopifyFilesService, 'uploadBufferToShopifyFiles').mockImplementation(async ({ filename }) => {
      callCount++;
      return {
        id: `gid://shopify/MediaImage/${1000 + callCount}`,
        url: `https://cdn.shopify.com/s/files/1/0000/0001/files/${filename}`,
        fileStatus: 'READY'
      };
    });

    const res = await request(app)
      .post(`/api/proxy/upload-design?${queryStr}`)
      .send({
        productId: '12345',
        variantId: '67890',
        selectedColor: 'Black',
        selectedSize: 'L',
        textConfiguration: [{ text: 'CUSTOM VIBES', fontSize: 32, fontColor: '#FFFFFF' }],
        logoReferences: [{ name: 'logo1.png', x: 100, y: 150 }],
        frontImage: validPngDataUrl,
        backImage: validPngDataUrl
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('designId');
    expect(res.body.designId).toMatch(/^des_/);

    // Verify assets
    expect(res.body.frontDesign.url).toContain('_front');
    expect(res.body.backDesign.url).toContain('_back');
    expect(res.body.metadata.url).toContain('_meta.json');

    // Verify cart properties
    const cartProps = res.body.cartProperties;
    expect(cartProps['_custom_design_id']).toBe(res.body.designId);
    expect(cartProps['Front Design URL']).toBe(res.body.frontDesign.url);
    expect(cartProps['Back Design URL']).toBe(res.body.backDesign.url);
    expect(cartProps['Selected color']).toBe('Black');
    expect(cartProps['Selected size']).toBe('L');
    expect(cartProps['_design_meta_url']).toBe(res.body.metadata.url);
  });
});

