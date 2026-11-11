const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { DEFAULT_SHOPIFY_API_VERSION, REQUIRED_SCOPES } = require('./constants');

/**
 * Validates and exports parsed environment configuration.
 */
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || 'http://localhost:3000',

  // Shopify App Credentials
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || '',
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || '',
  SHOPIFY_APP_URL: (process.env.SHOPIFY_APP_URL || process.env.HOST || 'http://localhost:3000').replace(/\/+$/, ''),
  SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION,
  SHOPIFY_SCOPES: (process.env.SHOPIFY_SCOPES || REQUIRED_SCOPES.join(',')).split(',').map((s) => s.trim()),

  // Optional direct access token for single-store installations or pre-authenticated shops
  SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
  SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN ? process.env.SHOPIFY_SHOP_DOMAIN.toLowerCase() : '',

  // AES-256-GCM encryption key for token storage on disk (must be 32 bytes or 64 hex chars)
  SESSION_ENCRYPTION_KEY: process.env.SESSION_ENCRYPTION_KEY || 'default-insecure-key-change-in-production-32b',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
};

/**
 * Validate required environment variables in production mode.
 */
env.validateProductionConfig = () => {
  const missing = [];
  if (!env.SHOPIFY_API_KEY) missing.push('SHOPIFY_API_KEY');
  if (!env.SHOPIFY_API_SECRET) missing.push('SHOPIFY_API_SECRET');
  if (!env.SHOPIFY_APP_URL) missing.push('SHOPIFY_APP_URL');
  if (!env.SESSION_ENCRYPTION_KEY || env.SESSION_ENCRYPTION_KEY === 'default-insecure-key-change-in-production-32b') {
    missing.push('SESSION_ENCRYPTION_KEY');
  }

  if (missing.length > 0 && env.NODE_ENV === 'production') {
    throw new Error(`[Config Error] Missing required production environment variables: ${missing.join(', ')}`);
  }
};

module.exports = env;

