const { createAuthUrl, exchangeCodeForToken } = require('../services/shopifyAuthService');
const tokenStorageService = require('../services/tokenStorageService');
const logger = require('../utils/logger');

/**
 * Initiates Shopify OAuth flow by redirecting merchant to Shopify authorize URL.
 */
function initiateAuth(req, res, next) {
  try {
    const shop = req.sanitizedShop;
    const { url } = createAuthUrl(shop);
    logger.info(`Redirecting shop ${shop} to Shopify OAuth authorize URL`);
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

/**
 * Handles OAuth callback after merchant authorizes the app.
 */
async function handleCallback(req, res, next) {
  try {
    const shop = req.sanitizedShop;
    const { code } = req.query;

    logger.info(`Processing OAuth callback for shop ${shop}`);
    const { accessToken, scope } = await exchangeCodeForToken(shop, code);

    logger.info(`Shop ${shop} successfully authorized app`, { scope });

    // HTML response confirming installation
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Custom Product Designer - Installed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f6f6f7; }
            .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
            h1 { color: #008060; margin-bottom: 12px; }
            p { color: #5c5f62; line-height: 1.5; }
            .btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #008060; color: white; text-decoration: none; border-radius: 4px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>App Successfully Installed!</h1>
            <p><strong>${shop}</strong> has successfully connected to the Custom Product Designer Backend.</p>
            <p>Your Konva customizer can now upload designs and attach them to products and orders.</p>
            <a class="btn" href="https://${shop}/admin/apps" target="_top">Go to Shopify Admin</a>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
}

/**
 * Returns installation status for a shop.
 */
function getAuthStatus(req, res) {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ success: false, error: 'shop query parameter required' });
  }

  const installed = tokenStorageService.hasToken(shop);
  res.status(200).json({
    shop,
    installed
  });
}

module.exports = {
  initiateAuth,
  handleCallback,
  getAuthStatus
};

