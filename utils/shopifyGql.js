const { getGraphQLEndpoint } = require('../config/shopify');
const logger = require('./logger');

/**
 * Custom error class for Shopify GraphQL errors.
 */
class ShopifyGraphQLError extends Error {
  constructor(message, userErrors = [], networkErrors = []) {
    super(message);
    this.name = 'ShopifyGraphQLError';
    this.userErrors = userErrors;
    this.networkErrors = networkErrors;
  }
}

/**
 * Executes a GraphQL query against Shopify Admin API.
 * Uses Node 20's global fetch.
 *
 * @param {object} params
 * @param {string} params.shop Shopify store domain
 * @param {string} params.accessToken Offline admin access token
 * @param {string} params.query GraphQL query string
 * @param {object} [params.variables] Optional variables
 * @param {string} [params.apiVersion] Optional API version override
 * @returns {Promise<object>} The data object from the GraphQL response
 */
async function executeShopifyGraphQL({ shop, accessToken, query, variables = {}, apiVersion }) {
  if (!shop) throw new Error('Shop domain is required for GraphQL execution');
  if (!accessToken) throw new Error('Access token is required for GraphQL execution');

  const endpoint = getGraphQLEndpoint(shop, apiVersion);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      Accept: 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`Shopify GraphQL HTTP error [${response.status}]`, {
      shop,
      status: response.status,
      body: errorBody
    });
    throw new ShopifyGraphQLError(
      `Shopify Admin API returned HTTP ${response.status}: ${errorBody}`,
      [],
      [{ status: response.status, message: errorBody }]
    );
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    logger.error('Shopify GraphQL response contained top-level errors', {
      shop,
      errors: result.errors
    });
    const message = result.errors.map((e) => e.message).join('; ');
    throw new ShopifyGraphQLError(message, [], result.errors);
  }

  return result.data;
}

module.exports = {
  executeShopifyGraphQL,
  ShopifyGraphQLError
};

