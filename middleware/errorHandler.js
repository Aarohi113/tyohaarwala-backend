const env = require('../config/env');
const logger = require('../utils/logger');
const { ShopifyGraphQLError } = require('../utils/shopifyGql');

/**
 * Centralized error handler.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error('Unhandled request error', {
    method: req.method,
    url: req.originalUrl,
    error: err.message,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  if (err instanceof ShopifyGraphQLError) {
    return res.status(502).json({
      success: false,
      error: 'Shopify Admin API error',
      details: err.message,
      userErrors: err.userErrors
    });
  }

  // Multer errors (file size, file type)
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const response = {
    success: false,
    error: err.message || 'Internal server error'
  };

  if (env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;

