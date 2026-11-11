const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { sanitizeShopDomain } = require('../config/shopify');
const { encryptText, decryptText } = require('../utils/cryptoUtils');
const logger = require('../utils/logger');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../.data');
const TOKEN_FILE = path.join(DATA_DIR, 'tokens.enc');

// In-memory cache for fast lookup
const tokenCache = new Map();

/**
 * Initializes data directory.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Loads and decrypts tokens from disk.
 * @returns {Record<string, { accessToken: string, scope: string, installedAt: string }>}
 */
function loadTokensFromDisk() {
  ensureDataDir();
  if (!fs.existsSync(TOKEN_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (!raw) return {};
    const decrypted = decryptText(raw, env.SESSION_ENCRYPTION_KEY);
    return JSON.parse(decrypted);
  } catch (err) {
    logger.error('Failed to decrypt tokens from disk', { error: err.message });
    return {};
  }
}

/**
 * Encrypts and writes tokens to disk.
 * @param {object} tokensObj
 */
function saveTokensToDisk(tokensObj) {
  ensureDataDir();
  const serialized = JSON.stringify(tokensObj, null, 2);
  const encrypted = encryptText(serialized, env.SESSION_ENCRYPTION_KEY);
  const tempFile = path.join(DATA_DIR, `tokens_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(tempFile, encrypted, 'utf8');
  fs.renameSync(tempFile, TOKEN_FILE);
}

/**
 * Stores an offline access token for a given shop.
 * @param {string} shop
 * @param {string} accessToken
 * @param {string} scope
 */
function storeToken(shop, accessToken, scope = '') {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) {
    throw new Error(`Cannot store token: invalid shop domain "${shop}"`);
  }

  const payload = {
    accessToken,
    scope,
    updatedAt: new Date().toISOString()
  };

  // Update in-memory cache
  tokenCache.set(sanitized, payload);

  // Persist to encrypted storage
  const diskTokens = loadTokensFromDisk();
  diskTokens[sanitized] = payload;
  saveTokensToDisk(diskTokens);

  logger.info(`Successfully stored offline token for ${sanitized}`);
}

/**
 * Retrieves the offline access token for a given shop.
 * Checks memory cache -> encrypted disk -> environment variable fallback.
 * @param {string} shop
 * @returns {string|null}
 */
function getToken(shop) {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) return null;

  // 1. Check in-memory cache
  if (tokenCache.has(sanitized)) {
    return tokenCache.get(sanitized).accessToken;
  }

  // 2. Check disk tokens
  const diskTokens = loadTokensFromDisk();
  if (diskTokens[sanitized] && diskTokens[sanitized].accessToken) {
    tokenCache.set(sanitized, diskTokens[sanitized]);
    return diskTokens[sanitized].accessToken;
  }

  // 3. Fallback: single-shop direct access token from environment
  if (env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    if (!env.SHOPIFY_SHOP_DOMAIN || env.SHOPIFY_SHOP_DOMAIN === sanitized) {
      return env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    }
  }

  return null;
}

/**
 * Removes token for a shop (e.g. app uninstalled).
 * @param {string} shop
 */
function deleteToken(shop) {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) return;

  tokenCache.delete(sanitized);

  const diskTokens = loadTokensFromDisk();
  if (diskTokens[sanitized]) {
    delete diskTokens[sanitized];
    saveTokensToDisk(diskTokens);
  }
}

/**
 * Checks whether a shop has an active installed token.
 * @param {string} shop
 * @returns {boolean}
 */
function hasToken(shop) {
  return Boolean(getToken(shop));
}

module.exports = {
  storeToken,
  getToken,
  deleteToken,
  hasToken
};

