const env = require('../config/env');
const { getAuthorizeUrl, getAccessTokenEndpoint, sanitizeShopDomain } = require('../config/shopify');
const { generateNonce } = require('../utils/cryptoUtils');
const tokenStorageService = require('./tokenStorageService');
const logger = require('../utils/logger');

// Store active nonces with 10 minutes TTL
const nonceStore = new Map();

/**
 * Creates OAuth authorization initiation URL.
 * @param {string} shop
 * @returns {{ url: string, state: string }}
 */
function createAuthUrl(shop) {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) {
    throw new Error(`Invalid shop domain: ${shop}`);
  }

  const state = generateNonce(16);
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  nonceStore.set(state, { shop: sanitized, expiresAt });

  // Clean expired nonces occasionally
  cleanupNonces();

  const redirectUri = `${env.SHOPIFY_APP_URL}/auth/callback`;
  const url = getAuthorizeUrl(sanitized, redirectUri, state);

  return { url, state };
}

/**
 * Validates nonce received in OAuth callback.
 * @param {string} state
 * @param {string} shop
 * @returns {boolean}
 */
function validateNonce(state, shop) {
  if (!state || !nonceStore.has(state)) {
    return false;
  }
  const entry = nonceStore.get(state);
  nonceStore.delete(state); // One-time use

  if (Date.now() > entry.expiresAt) {
    return false;
  }

  const sanitized = sanitizeShopDomain(shop);
  return entry.shop === sanitized;
}

/**
 * Periodically removes expired nonces.
 */
function cleanupNonces() {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (now > value.expiresAt) {
      nonceStore.delete(key);
    }
  }
}

/**
 * Exchanges OAuth authorization code for offline access token.
 * @param {string} shop
 * @param {string} code
 * @returns {Promise<{ accessToken: string, scope: string }>}
 */
async function exchangeCodeForToken(shop, code) {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) {
    throw new Error(`Invalid shop domain: ${shop}`);
  }

  const tokenEndpoint = getAccessTokenEndpoint(sanitized);

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Token exchange failed', {
      shop: sanitized,
      status: response.status,
      body: errorBody
    });
    throw new Error(`Failed to exchange code for token: HTTP ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const scope = data.scope || '';

  if (!accessToken) {
    throw new Error('Shopify did not return an access_token');
  }

  tokenStorageService.storeToken(sanitized, accessToken, scope);

  return { accessToken, scope };
}

module.exports = {
  createAuthUrl,
  validateNonce,
  exchangeCodeForToken
};

