const env = require('../config/env');

function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    environment: env.NODE_ENV,
    apiVersion: env.SHOPIFY_API_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  getHealth
};

