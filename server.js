const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const securityHeaders = require('./middleware/securityHeaders');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Routes
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

// Validate production configuration
env.validateProductionConfig();

const app = express();

// Trust proxy for Render / load balancers
app.set('trust proxy', 1);

// Security Headers
app.use(securityHeaders);

// CORS configuration (allow Shopify storefront requests)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests from any myshopify store or admin domain or null origin (server-to-server/App Proxy)
      if (!origin || /\.myshopify\.com$/.test(origin) || /admin\.shopify\.com$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Shopify-Hmac-Sha256']
  })
);

// Capture raw body for webhook verification before body parsing
app.use(
  express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '50mb',
    verify: (req, res, buf) => {
      if (!req.rawBody) {
        req.rawBody = buf;
      }
    }
  })
);

// Mount Health check
app.use('/', healthRoutes);

// Mount OAuth routes
app.use('/', authRoutes);

// Mount Storefront App Proxy routes
app.use('/api/proxy', proxyRoutes);

// Mount Shopify Webhook routes
app.use('/api/webhooks', webhookRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized Error Handler
app.use(errorHandler);

// Start server only when run directly (not when required by Jest tests)
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(env.PORT, () => {
    logger.info(`Custom Product Designer Backend running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`App URL: ${env.SHOPIFY_APP_URL}`);
    logger.info(`Shopify API Version: ${env.SHOPIFY_API_VERSION}`);
  });

  const handleShutdown = (signal) => {
    logger.info(`${signal} received. Initiating graceful shutdown...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force shutdown after 10s timeout
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

module.exports = app;

