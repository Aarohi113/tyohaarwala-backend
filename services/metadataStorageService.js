const shopifyFilesService = require('./shopifyFilesService');
const logger = require('../utils/logger');

/**
 * Builds and uploads design metadata JSON manifest to Shopify Files.
 *
 * @param {object} params
 * @param {string} params.shop
 * @param {string} params.accessToken
 * @param {string} params.designId
 * @param {string|number} params.productId
 * @param {string|number} params.variantId
 * @param {string} [params.selectedColor]
 * @param {string} [params.selectedSize]
 * @param {object} params.frontDesign { fileId, url }
 * @param {object} params.backDesign { fileId, url }
 * @param {object|Array} [params.textConfiguration]
 * @param {object|Array} [params.logoReferences]
 * @param {object} [params.additionalMetadata]
 * @returns {Promise<{ manifestFileId: string, manifestUrl: string, manifest: object }>}
 */
async function storeDesignMetadata({
  shop,
  accessToken,
  designId,
  productId,
  variantId,
  selectedColor = '',
  selectedSize = '',
  frontDesign,
  backDesign,
  textConfiguration = [],
  logoReferences = [],
  additionalMetadata = {}
}) {
  const createdAt = new Date().toISOString();

  const manifest = {
    schemaVersion: '1.0',
    designId,
    shop,
    productId: String(productId),
    variantId: String(variantId),
    selectedColor,
    selectedSize,
    assets: {
      front: {
        fileId: frontDesign.fileId,
        url: frontDesign.url
      },
      back: {
        fileId: backDesign.fileId,
        url: backDesign.url
      }
    },
    customization: {
      textConfiguration,
      logoReferences
    },
    metadata: additionalMetadata,
    createdAt
  };

  const jsonString = JSON.stringify(manifest, null, 2);
  const jsonBuffer = Buffer.from(jsonString, 'utf8');
  const filename = `design_${designId}_meta.json`;

  logger.info(`Uploading design metadata manifest for design ${designId} to Shopify Files...`);

  const fileResult = await shopifyFilesService.uploadBufferToShopifyFiles({
    shop,
    accessToken,
    buffer: jsonBuffer,
    filename,
    mimeType: 'application/json',
    resource: 'FILE',
    alt: `Design Metadata Manifest [${designId}]`
  });

  return {
    manifestFileId: fileResult.id,
    manifestUrl: fileResult.url,
    manifest
  };
}

module.exports = {
  storeDesignMetadata
};
