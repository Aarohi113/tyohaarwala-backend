const tokenStorageService = require('./services/tokenStorageService');
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
// Shopify App Entry Point
app.get('/', (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(200).send(
      'Custom Product Designer Backend is running.'
    );
  }

  // Check if shop has already installed the app
  if (tokenStorageService.hasToken(shop)) {
    return res.status(200).send(`
      <html>
        <body style="font-family:Arial;text-align:center;padding:50px">
          <h2>Custom Product Designer Connected!</h2>
          <p>Your Shopify store is successfully connected.</p>
          <a href="https://${shop}/admin/apps">
            Go to Shopify Admin
          </a>
        </body>
      </html>
    `);
  }

  // Start OAuth installation
  return res.redirect(
    `/auth?shop=${encodeURIComponent(shop)}`
  );
});
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

