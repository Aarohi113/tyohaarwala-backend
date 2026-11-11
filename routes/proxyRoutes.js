const express = require('express');
const router = express.Router();
const multer = require('multer');
const designController = require('../controllers/designController');
const verifyAppProxy = require('../middleware/verifyAppProxy');
const { proxyRateLimiter } = require('../middleware/rateLimiter');
const { UPLOAD_LIMITS } = require('../config/constants');

// Configure memory storage for streaming / memory-efficient buffer handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES,
    files: 2
  }
});

const uploadFields = upload.fields([
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage', maxCount: 1 }
]);

/**
 * App Proxy route for uploading customized front and back designs.
 * Endpoint: POST /api/proxy/upload-design
 * Through Shopify Proxy: POST https://<store>.myshopify.com/apps/product-designer/upload-design
 */
router.post(
  ['/upload-design', '/'],
  proxyRateLimiter,
  verifyAppProxy,
  uploadFields,
  designController.uploadDesign
);

module.exports = router;

