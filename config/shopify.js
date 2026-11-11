const env = require('./env');

const SHOP_DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;

/**
 * Validates whether a domain string is a valid .myshopify.com subdomain.
 * @param {string} shop
 * @returns {boolean}
 */
function isValidShopDomain(shop) {
  if (!shop || typeof shop !== 'string') return false;
  const cleanShop = shop.trim().toLowerCase();
  return SHOP_DOMAIN_REGEX.test(cleanShop);
}

/**
 * Sanitizes shop parameter.
 * @param {string} shop
 * @returns {string|null}
 */
function sanitizeShopDomain(shop) {
  if (!shop) return null;
  let clean = shop.trim().toLowerCase();
  if (!clean.includes('.myshopify.com')) {
    clean = `${clean}.myshopify.com`;
  }
  return isValidShopDomain(clean) ? clean : null;
}

/**
 * Builds the Shopify Admin GraphQL endpoint for a given shop.
 * @param {string} shop
 * @param {string} [apiVersion]
 * @returns {string}
 */
function getGraphQLEndpoint(shop, apiVersion = env.SHOPIFY_API_VERSION) {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) {
    throw new Error(`Invalid shop domain: ${shop}`);
  }
  return `https://${sanitized}/admin/api/${apiVersion}/graphql.json`;
}

/**
 * Builds the Shopify OAuth authorize URL.
 * @param {string} shop
 * @param {string} redirectUri
 * @param {string} state
 * @returns {string}
 */
function getAuthorizeUrl(shop, redirectUri, state) {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) {
    throw new Error(`Invalid shop domain: ${shop}`);
  }
  const scopes = env.SHOPIFY_SCOPES.join(',');
  const query = new URLSearchParams({
    client_id: env.SHOPIFY_API_KEY,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state
  });

  return `https://${sanitized}/admin/oauth/authorize?${query.toString()}`;
}

/**
 * Returns access token exchange endpoint.
 * @param {string} shop
 * @returns {string}
 */
function getAccessTokenEndpoint(shop) {
  const sanitized = sanitizeShopDomain(shop);
  if (!sanitized) {
    throw new Error(`Invalid shop domain: ${shop}`);
  }
  return `https://${sanitized}/admin/oauth/access_token`;
}

module.exports = {
  isValidShopDomain,
  sanitizeShopDomain,
  getGraphQLEndpoint,
  getAuthorizeUrl,
  getAccessTokenEndpoint
};

