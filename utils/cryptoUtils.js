const crypto = require('crypto');

/**
 * Compares two strings using constant-time comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically strong random hex nonce for OAuth state.
 * @param {number} [bytes=16]
 * @returns {string}
 */
function generateNonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Verifies standard Shopify OAuth redirect HMAC.
 * Query parameters excluding 'hmac' and 'signature' are sorted and joined with '&'.
 * @param {object} query
 * @param {string} secret
 * @returns {boolean}
 */
function verifyOAuthHmac(query, secret) {
  if (!query || !query.hmac || !secret) {
    return false;
  }
  const { hmac, signature, ...rest } = query;
  const sortedParams = Object.keys(rest)
    .sort()
    .map((key) => {
      const val = rest[key];
      return `${key}=${Array.isArray(val) ? val.join(',') : val}`;
    })
    .join('&');

  const calculated = crypto
    .createHmac('sha256', secret)
    .update(sortedParams, 'utf8')
    .digest('hex');

  return safeCompare(hmac.toLowerCase(), calculated.toLowerCase());
}

/**
 * Verifies Shopify App Proxy signature.
 * App Proxy signs all query parameters (excluding 'signature').
 * Parameters are sorted alphabetically and joined with NO delimiter (key=valuekey2=value2).
 * @param {object} query
 * @param {string} secret
 * @returns {boolean}
 */
function verifyAppProxySignature(query, secret) {
  if (!query || !query.signature || !secret) {
    return false;
  }
  const { signature, ...rest } = query;
  const sortedPairs = Object.keys(rest)
    .sort()
    .map((key) => {
      const val = rest[key];
      return `${key}=${Array.isArray(val) ? val.join(',') : val}`;
    })
    .join('');

  const calculated = crypto
    .createHmac('sha256', secret)
    .update(sortedPairs, 'utf8')
    .digest('hex');

  return safeCompare(signature.toLowerCase(), calculated.toLowerCase());
}

/**
 * Verifies Shopify Webhook HMAC header.
 * @param {Buffer|string} rawBody
 * @param {string} hmacHeader Base64 HMAC sent in X-Shopify-Hmac-Sha256
 * @param {string} secret
 * @returns {boolean}
 */
function verifyWebhookHmac(rawBody, hmacHeader, secret) {
  if (!rawBody || !hmacHeader || !secret) {
    return false;
  }
  const calculated = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  return safeCompare(hmacHeader, calculated);
}

/**
 * Derives a 32-byte key from any password/string using SHA-256.
 * @param {string} keyString
 * @returns {Buffer}
 */
function getDerivedKey(keyString) {
  return crypto.createHash('sha256').update(keyString).digest();
}

/**
 * Encrypts arbitrary text using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex)
 * @param {string} text
 * @param {string} secretKey
 * @returns {string}
 */
function encryptText(text, secretKey) {
  const iv = crypto.randomBytes(12);
  const key = getDerivedKey(secretKey);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text encrypted by encryptText (AES-256-GCM).
 * @param {string} encryptedString
 * @param {string} secretKey
 * @returns {string}
 */
function decryptText(encryptedString, secretKey) {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getDerivedKey(secretKey);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  safeCompare,
  generateNonce,
  verifyOAuthHmac,
  verifyAppProxySignature,
  verifyWebhookHmac,
  encryptText,
  decryptText
};

