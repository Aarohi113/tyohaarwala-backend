const crypto = require('crypto');
const {
  validatePngImage,
  dataUrlToBuffer,
  generateUniqueFilename
} = require('../utils/fileValidator');
const shopifyValidationService = require('../services/shopifyValidationService');
const shopifyFilesService = require('../services/shopifyFilesService');
const metadataStorageService = require('../services/metadataStorageService');
const { LINE_ITEM_PROPERTIES } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Generates a unique design ID.
 * @returns {string}
 */
function generateDesignId() {
  const dateStr = Date.now().toString(36);
  const randomStr = crypto.randomBytes(4).toString('hex');
  return `des_${dateStr}_${randomStr}`;
}

/**
 * Controller to upload front & back designs and generate design metadata.
 *
 * Accepts either:
 * - JSON body with base64 data URLs: { frontImage: "data:image/png;base64,...", backImage: "...", ... }
 * - Multipart/form-data with files: req.files.frontImage, req.files.backImage
 */
async function uploadDesign(req, res, next) {
  try {
    const shop = req.shop;
    const accessToken = req.shopifyAccessToken;

    // 1. Extract buffers from request
    let frontBuffer = null;
    let backBuffer = null;

    if (req.files && (req.files.frontImage || req.files.backImage)) {
      if (req.files.frontImage && req.files.frontImage[0]) {
        frontBuffer = req.files.frontImage[0].buffer;
      }
      if (req.files.backImage && req.files.backImage[0]) {
        backBuffer = req.files.backImage[0].buffer;
      }
    } else if (req.body) {
      if (req.body.frontImage) {
        frontBuffer = dataUrlToBuffer(req.body.frontImage);
      }
      if (req.body.backImage) {
        backBuffer = dataUrlToBuffer(req.body.backImage);
      }
    }

    if (!frontBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required front design image (frontImage).'
      });
    }

    if (!backBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required back design image (backImage).'
      });
    }

    // 2. Validate PNG images (MIME, magic bytes, file size)
    const frontValidation = validatePngImage(frontBuffer, 'Front Design');
    if (!frontValidation.valid) {
      return res.status(400).json({ success: false, error: frontValidation.error });
    }

    const backValidation = validatePngImage(backBuffer, 'Back Design');
    if (!backValidation.valid) {
      return res.status(400).json({ success: false, error: backValidation.error });
    }

    // 3. Extract and parse parameters
    const {
      productId,
      variantId,
      selectedColor = '',
      selectedSize = '',
      textConfiguration,
      logoReferences,
      additionalMetadata
    } = req.body;

    if (!productId || !variantId) {
      return res.status(400).json({
        success: false,
        error: 'Both productId and variantId are required to link designs to a valid catalog item.'
      });
    }

    // 4. Validate product and variant with Shopify Admin API
    const validationResult = await shopifyValidationService.validateProductAndVariant({
      shop,
      accessToken,
      productId,
      variantId
    });

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid product or variant: ${validationResult.error}`
      });
    }

    // Parse nested JSON if passed via form-data strings
    let parsedTextConfig = textConfiguration;
    if (typeof textConfiguration === 'string') {
      try {
        parsedTextConfig = JSON.parse(textConfiguration);
      } catch {
        parsedTextConfig = [];
      }
    }

    let parsedLogos = logoReferences;
    if (typeof logoReferences === 'string') {
      try {
        parsedLogos = JSON.parse(logoReferences);
      } catch {
        parsedLogos = [];
      }
    }

    let parsedAdditional = additionalMetadata;
    if (typeof additionalMetadata === 'string') {
      try {
        parsedAdditional = JSON.parse(additionalMetadata);
      } catch {
        parsedAdditional = {};
      }
    }

    // 5. Generate unique design ID
    const designId = generateDesignId();
    logger.info(`Processing design upload [${designId}] for shop ${shop}, variant ${variantId}`);

    // 6. Upload front image to Shopify Files
    const frontFilename = generateUniqueFilename(`design_${designId}_front`, 'png');
    const frontUploadResult = await shopifyFilesService.uploadBufferToShopifyFiles({
      shop,
      accessToken,
      buffer: frontBuffer,
      filename: frontFilename,
      mimeType: 'image/png',
      resource: 'IMAGE',
      alt: `Customizer Front Design [${designId}]`
    });

    // 7. Upload back image to Shopify Files
    const backFilename = generateUniqueFilename(`design_${designId}_back`, 'png');
    const backUploadResult = await shopifyFilesService.uploadBufferToShopifyFiles({
      shop,
      accessToken,
      buffer: backBuffer,
      filename: backFilename,
      mimeType: 'image/png',
      resource: 'IMAGE',
      alt: `Customizer Back Design [${designId}]`
    });

    // 8. Package and persist design metadata manifest into Shopify Files
    const metadataResult = await metadataStorageService.storeDesignMetadata({
      shop,
      accessToken,
      designId,
      productId,
      variantId,
      selectedColor,
      selectedSize,
      frontDesign: {
        fileId: frontUploadResult.id,
        url: frontUploadResult.url
      },
      backDesign: {
        fileId: backUploadResult.id,
        url: backUploadResult.url
      },
      textConfiguration: parsedTextConfig,
      logoReferences: parsedLogos,
      additionalMetadata: parsedAdditional
    });

    // 9. Construct prepared cart line item properties
    const cartProperties = {
      [LINE_ITEM_PROPERTIES.DESIGN_ID]: designId,
      [LINE_ITEM_PROPERTIES.FRONT_DESIGN_URL]: frontUploadResult.url,
      [LINE_ITEM_PROPERTIES.BACK_DESIGN_URL]: backUploadResult.url,
      [LINE_ITEM_PROPERTIES.COLOR]: selectedColor,
      [LINE_ITEM_PROPERTIES.SIZE]: selectedSize,
      [LINE_ITEM_PROPERTIES.META_URL]: metadataResult.manifestUrl
    };

    logger.info(`Successfully completed design upload [${designId}]`, {
      frontUrl: frontUploadResult.url,
      backUrl: backUploadResult.url,
      metaUrl: metadataResult.manifestUrl
    });

    return res.status(200).json({
      success: true,
      designId,
      shop,
      variantId,
      frontDesign: {
        fileId: frontUploadResult.id,
        url: frontUploadResult.url
      },
      backDesign: {
        fileId: backUploadResult.id,
        url: backUploadResult.url
      },
      metadata: {
        fileId: metadataResult.manifestFileId,
        url: metadataResult.manifestUrl
      },
      cartProperties
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadDesign,
  generateDesignId
};
