/**
 * Application Constants
 */
module.exports = {
  // Shopify API Version (quarterly release cadence)
  DEFAULT_SHOPIFY_API_VERSION: '2026-10',

  // Required Shopify OAuth Scopes
  REQUIRED_SCOPES: [
    'write_app_proxy',
    'write_files',
    'read_files',
    'read_products',
    'read_orders'
  ],

  // Upload validation limits
  UPLOAD_LIMITS: {
    MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024, // 15 MB max per image
    ALLOWED_MIME_TYPES: ['image/png'],
    PNG_SIGNATURE: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  },

  // App Proxy verification
  APP_PROXY: {
    MAX_TIMESTAMP_DRIFT_SECONDS: 300 // 5 minutes tolerance for clock drift / replay prevention
  },

  // Line item property names expected by storefront
  LINE_ITEM_PROPERTIES: {
    DESIGN_ID: '_custom_design_id',
    FRONT_DESIGN_URL: 'Front Design URL',
    BACK_DESIGN_URL: 'Back Design URL',
    COLOR: 'Selected color',
    SIZE: 'Selected size',
    META_URL: '_design_meta_url'
  }
};

