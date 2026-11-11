const { executeShopifyGraphQL } = require('../utils/shopifyGql');
const logger = require('../utils/logger');

/**
 * Normalizes numeric or GID string into standard Shopify GraphQL ID.
 * @param {string|number} id
 * @param {'Product'|'ProductVariant'} type
 * @returns {string}
 */
function toGlobalId(id, type) {
  if (!id) return '';
  const str = String(id).trim();
  if (str.startsWith('gid://shopify/')) {
    return str;
  }
  return `gid://shopify/${type}/${str}`;
}

const VALIDATE_PRODUCT_AND_VARIANT_QUERY = `
  query ValidateProductAndVariant($productId: ID!, $variantId: ID!) {
    product(id: $productId) {
      id
      title
      handle
      status
    }
    productVariant(id: $variantId) {
      id
      title
      price
      availableForSale
      product {
        id
      }
      selectedOptions {
        name
        value
      }
    }
  }
`;

/**
 * Validates that client-supplied productId and variantId exist in the merchant's store
 * and that the variant actually belongs to the product.
 *
 * @param {object} params
 * @param {string} params.shop
 * @param {string} params.accessToken
 * @param {string|number} params.productId
 * @param {string|number} params.variantId
 * @returns {Promise<{ valid: boolean, error?: string, product?: object, variant?: object }>}
 */
async function validateProductAndVariant({ shop, accessToken, productId, variantId }) {
  if (!productId || !variantId) {
    return {
      valid: false,
      error: 'Both productId and variantId are required.'
    };
  }

  const productGid = toGlobalId(productId, 'Product');
  const variantGid = toGlobalId(variantId, 'ProductVariant');

  try {
    const data = await executeShopifyGraphQL({
      shop,
      accessToken,
      query: VALIDATE_PRODUCT_AND_VARIANT_QUERY,
      variables: {
        productId: productGid,
        variantId: variantGid
      }
    });

    if (!data.product) {
      return {
        valid: false,
        error: `Product not found on store: ${productId}`
      };
    }

    if (!data.productVariant) {
      return {
        valid: false,
        error: `Product variant not found on store: ${variantId}`
      };
    }

    // Ensure the variant belongs to the requested product
    if (data.productVariant.product.id !== data.product.id) {
      return {
        valid: false,
        error: `Variant ${variantId} does not belong to product ${productId}`
      };
    }

    return {
      valid: true,
      product: data.product,
      variant: data.productVariant
    };
  } catch (err) {
    logger.error('Error validating product and variant via Shopify GraphQL', {
      shop,
      productId,
      variantId,
      error: err.message
    });
    return {
      valid: false,
      error: `Shopify validation failed: ${err.message}`
    };
  }
}

module.exports = {
  toGlobalId,
  validateProductAndVariant
};

