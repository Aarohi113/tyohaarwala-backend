# Custom Product Designer – Production Shopify Backend

A secure, production-grade Node.js/Express backend architected for the **Custom Product Designer** Shopify customizer on the **Horizon** theme.

This backend interfaces with **Shopify Admin GraphQL API (2025-01)**, **Shopify Files API**, **Shopify App Proxy**, and **Shopify Webhooks**. It validates and persists high-resolution Konva.js canvas exports into the merchant's Shopify Files CDN and attaches design references to Shopify cart items and orders without requiring external databases.

---

## Table of Contents
- [1. Architecture Overview](#1-architecture-overview)
- [2. Shopify Dev Dashboard Configuration](#2-shopify-dev-dashboard-configuration)
- [3. Installation & OAuth Token Storage Strategy](#3-installation--oauth-token-storage-strategy)
- [4. Shopify App Proxy Integration](#4-shopify-app-proxy-integration)
- [5. Zero-Database Metadata Storage Strategy](#5-zero-database-metadata-storage-strategy)
- [6. Horizon Theme Cart Integration](#6-horizon-theme-cart-integration)
- [7. Order Webhook & Idempotency](#7-order-webhook--idempotency)
- [8. Directory Structure](#8-directory-structure)
- [9. Environment Variables](#9-environment-variables)
- [10. Render Deployment Guide](#10-render-deployment-guide)
- [11. Testing & Verification](#11-testing--verification)

---

## 1. Architecture Overview

```
                      +---------------------------------------+
                      |       Shopify Storefront (Horizon)     |
                      |   Liquid + Konva.js Customizer Canvas |
                      +-------------------+-------------------+
                                          |
                        1. POST /apps/product-designer/upload-design
                                          |
                                          v
                      +---------------------------------------+
                      |            Shopify App Proxy          |
                      | (Signs request with HMAC-SHA256 query)|
                      +-------------------+-------------------+
                                          |
                        2. Proxy forward with signature
                                          |
                                          v
      +---------------------------------------------------------------+
      |              Express.js Backend (Render Hosted)               |
      |                                                               |
      |  [middleware/verifyAppProxy.js]                               |
      |   - Verifies HMAC signature using SHOPIFY_API_SECRET           |
      |   - Checks timestamp drift (<= 300s replay attack prevention) |
      |   - Validates shop domain (*.myshopify.com)                   |
      |                                                               |
      |  [controllers/designController.js]                            |
      |   - Validates PNG magic bytes & size (<= 15MB)                |
      |   - Validates Product & Variant existence via GraphQL         |
      |   - Calls stagedUploadsCreate + binary PUT/POST + fileCreate  |
      |   - Uploads front PNG, back PNG & companion JSON manifest     |
      |   - Returns CDN URLs & formatted cart line-item properties    |
      +-------------------------------+-------------------------------+
                                      |
                        3. GraphQL API Calls
                                      |
                                      v
                      +---------------------------------------+
                      |          Shopify Files API            |
                      |   - design_{id}_front.png             |
                      |   - design_{id}_back.png              |
                      |   - design_{id}_meta.json             |
                      +---------------------------------------+
                                      |
                        4. Add to Cart with Properties:
                           - _custom_design_id
                           - Front Design URL
                           - Back Design URL
                           - Selected color / Selected size
                           - _design_meta_url
                                      |
                                      v
                      +---------------------------------------+
                      |         Shopify Checkout & Order      |
                      |  - Properties preserved in Line Items |
                      |  - Webhook triggers /api/webhooks/    |
                      |    orders-create for fulfillment      |
                      +---------------------------------------+
```

---

## 2. Shopify Dev Dashboard Configuration

Before deploying and testing the app, configure the following settings in your **Shopify Partner Dashboard** (or Dev Dashboard):

### A. App URLs & Redirection
1. Navigate to **Apps** > Click **Custom Product Designer** > **App setup**.
2. Set **App URL**:
   ```
   https://<your-render-service>.onrender.com
   ```
3. Under **Allowed redirection URL(s)**, add:
   ```
   https://<your-render-service>.onrender.com/auth/callback
   ```

### B. App Proxy Configuration
Shopify App Proxy enables your storefront JavaScript to communicate directly with your backend under the store's domain without CORS issues or exposing credentials.
1. In **App setup**, scroll to **App proxy**.
2. Click **Create app proxy** (or Edit):
   - **Subpath prefix**: `apps`
   - **Subpath**: `product-designer`
   - **Proxy URL**: `https://<your-render-service>.onrender.com/api/proxy`
3. Click **Save**.

Your storefront customizer can now submit requests to:
```
POST https://{shop}.myshopify.com/apps/product-designer/upload-design
```

### C. Access Scopes
Ensure the following API scopes are granted in App Configuration:
- `write_files` & `read_files` (Shopify Files API staging & creation)
- `read_products` (Validate product and variant existence)
- `read_orders` & `write_orders` (Order webhook processing and order metadata)

### D. Webhook Configuration
In the Partner Dashboard or via Admin API:
- **Event topic**: `orders/create` (or `orders/paid`)
- **Format**: `JSON`
- **URL**: `https://<your-render-service>.onrender.com/api/webhooks/orders-create`
- **API Version**: `2025-01`

---

## 3. Installation & OAuth Token Storage Strategy

### Multi-Store & Custom App Installation Architecture
Client Credentials Grant is not supported for regular merchant stores in Shopify. Standard Shopify apps use OAuth 2.0 with offline access tokens (`access_mode=offline`):

1. **Initiation (`GET /auth?shop=store.myshopify.com`)**:
   - Validates that `shop` is a genuine `*.myshopify.com` domain.
   - Generates a cryptographically random, short-lived nonce (`state`) stored with a 10-minute TTL.
   - Redirects merchant to `https://{shop}/admin/oauth/authorize`.
2. **Callback (`GET /auth/callback`)**:
   - Verifies the Shopify query HMAC parameter using `SHOPIFY_API_SECRET`.
   - Validates the `state` nonce to prevent CSRF.
   - Exchanges the temporary authorization `code` with Shopify via `POST https://{shop}/admin/oauth/access_token`.
   - Retrieves a permanent offline access token.

### Secure Token Persistence (Zero External Database)
- **Encryption at Rest**: Offline tokens are encrypted using **AES-256-GCM** with authentication tags via `SESSION_ENCRYPTION_KEY` and saved to an encrypted local file (`.data/tokens.enc`).
- **In-Memory Cache**: High-speed in-memory map eliminates repeated disk reads during frequent storefront calls.
- **Single-Store Fallback**: If installing on a single store with pre-generated custom credentials, you can provide `SHOPIFY_ADMIN_ACCESS_TOKEN` directly in the environment variables without undergoing OAuth.

---

## 4. Shopify App Proxy Integration

When a customer uses the customizer on your storefront, requests sent to `https://your-store.myshopify.com/apps/product-designer/upload-design` are intercepted by Shopify and forwarded to:
```
POST https://<your-backend>.onrender.com/api/proxy/upload-design?<shopify-query-params>
```

### App Proxy Verification Workflow
Implemented in `middleware/verifyAppProxy.js`:
1. **Timestamp Freshness**: Verifies the `timestamp` parameter is within 300 seconds (5 minutes) of the server epoch time, preventing replay attacks.
2. **Shop Domain Validation**: Enforces standard `^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$` structure.
3. **Canonical Signature Calculation**:
   - Extracts all query parameters except `signature`.
   - Lexicographically sorts keys.
   - Concatenates pairs as `key=value` with **no delimiter**.
   - Calculates HMAC-SHA256 with `SHOPIFY_API_SECRET`.
   - Verifies against `signature` using timing-safe comparison (`crypto.timingSafeEqual`).
4. **Token Resolution**: Retrieves the merchant's offline token from encrypted storage and binds `req.shop` and `req.shopifyAccessToken`.

---

## 5. Zero-Database Metadata Storage Strategy

Requirement: **Store complete design metadata without MongoDB, Firebase, Supabase, or SQL databases.**

### How Metadata is Persisted Natively in Shopify:
1. When Konva.js exports Front and Back PNGs, the backend uploads them to **Shopify Files** via GraphQL mutations:
   - `stagedUploadsCreate(resource: IMAGE)`
   - Binary buffer upload to the staging bucket (S3/GCS)
   - `fileCreate` registering the asset in the merchant's Files library.
2. The backend creates a companion manifest file: `design_{designId}_meta.json` containing:
   ```json
   {
     "schemaVersion": "1.0",
     "designId": "des_mwbwohiz_45055ebf",
     "shop": "your-store.myshopify.com",
     "productId": "1234567890",
     "variantId": "9876543210",
     "selectedColor": "Black",
     "selectedSize": "XL",
     "assets": {
       "front": { "fileId": "gid://shopify/MediaImage/1001", "url": "https://cdn.shopify.com/..._front.png" },
       "back": { "fileId": "gid://shopify/MediaImage/1002", "url": "https://cdn.shopify.com/..._back.png" }
     },
     "customization": {
       "textConfiguration": [{ "text": "MY DESIGN", "fontSize": 32, "fontColor": "#ffffff", "fontFamily": "Roboto", "bold": true }],
       "logoReferences": [{ "filename": "logo.png", "x": 120, "y": 80, "scale": 1.2 }]
     },
     "createdAt": "2026-11-11T14:30:00.000Z"
   }
   ```
3. The JSON manifest is uploaded directly to **Shopify Files** via `stagedUploadsCreate(resource: FILE)` and `fileCreate`.
4. The resulting CDN URLs for the images and JSON manifest are returned to the frontend.
5. The frontend adds these URLs to the Shopify Cart line item properties.
6. When an order is created, Shopify permanently preserves the line item properties on the line item record.
7. The order creation webhook indexes and confirms these references.

**Result**: 100% of the assets, design specifications, and order linkages live inside Shopify's native infrastructure. Zero external database dependencies or recurring database hosting costs.

---

## 6. Horizon Theme Cart Integration

In your existing frontend (Konva.js + Vanilla JS in Horizon theme), when the customer clicks "Add to Cart":

1. Export Front and Back canvas designs as base64 PNGs:
   ```javascript
   const frontDataUrl = frontStage.toDataURL({ mimeType: 'image/png', pixelRatio: 2 });
   const backDataUrl = backStage.toDataURL({ mimeType: 'image/png', pixelRatio: 2 });
   ```
2. POST the payload to the App Proxy endpoint:
   ```javascript
   const response = await fetch('/apps/product-designer/upload-design', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       productId: currentProductId,
       variantId: currentVariantId,
       selectedColor: currentColor,
       selectedSize: currentSize,
       frontImage: frontDataUrl,
       backImage: backDataUrl,
       textConfiguration: textElementsArray,
       logoReferences: logosArray
     })
   });

   const result = await response.json();
   if (!result.success) throw new Error(result.error);
   ```
3. Submit the item to the Shopify `/cart/add.js` endpoint using the actual selected variant:
   ```javascript
   await fetch('/cart/add.js', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       items: [
         {
           id: currentVariantId, // The ACTUAL Shopify variant (no fake duplicates)
           quantity: 1,
           properties: result.cartProperties
         }
       ]
     })
   });
   ```

### Cart Properties Mapping
Properties returned by backend:
| Property Name | Visibility | Description |
|---|---|---|
| `_custom_design_id` | Hidden (starts with `_`) | Unique internal design identifier |
| `Front Design URL` | Customer & Merchant visible | CDN link to Front design PNG |
| `Back Design URL` | Customer & Merchant visible | CDN link to Back design PNG |
| `Selected color` | Customer & Merchant visible | Selected color variant |
| `Selected size` | Customer & Merchant visible | Selected size variant |
| `_design_meta_url` | Hidden (starts with `_`) | CDN link to complete JSON design manifest |

---

## 7. Order Webhook & Idempotency

- Endpoint: `POST /api/webhooks/orders-create`
- Verified using `X-Shopify-Hmac-Sha256` computed against the raw unparsed request body.
- Implements an **in-memory idempotency cache** (`processedOrderIds` set with capacity limits) to prevent duplicate processing on Shopify webhook retries.
- Extracts customized items and logs design URLs.

---

## 8. Directory Structure

```
custom-product-designer-backend/
├── config/
│   ├── constants.js            # Scopes, upload limits, PNG signature, version
│   ├── env.js                  # Environment parser and production validator
│   └── shopify.js              # Shop domain sanitization & URL generators
├── controllers/
│   ├── authController.js       # OAuth initiation & callback handling
│   ├── designController.js     # Upload & metadata orchestration
│   ├── healthController.js     # /health endpoint
│   └── webhookController.js    # orders/create webhook handler with idempotency
├── middleware/
│   ├── errorHandler.js         # Centralized error handler & GraphQL error parser
│   ├── rateLimiter.js          # Express rate limiting for proxy & auth
│   ├── securityHeaders.js      # Helmet CSP & iframe embedding configuration
│   ├── verifyAppProxy.js       # App Proxy canonical HMAC & timestamp verification
│   ├── verifyOAuth.js          # OAuth redirect & callback HMAC verification
│   └── verifyWebhook.js        # Raw-body Webhook HMAC verification
├── routes/
│   ├── authRoutes.js           # /auth, /auth/callback, /auth/status
│   ├── healthRoutes.js         # /health
│   ├── proxyRoutes.js          # /api/proxy/upload-design
│   └── webhookRoutes.js        # /api/webhooks/orders-create
├── services/
│   ├── metadataStorageService.js # JSON manifest generation & upload to Shopify Files
│   ├── shopifyAuthService.js   # OAuth authorize URL and token exchange
│   ├── shopifyFilesService.js  # stagedUploadsCreate + binary storage + fileCreate
│   ├── shopifyValidationService.js # GraphQL validation of product/variant IDs
│   └── tokenStorageService.js  # AES-256-GCM encrypted disk persistence & cache
├── utils/
│   ├── cryptoUtils.js          # Constant-time comparison, HMAC & AES encryption
│   ├── fileValidator.js        # PNG magic header byte checker & filename generator
│   ├── logger.js               # Structured logger
│   └── shopifyGql.js           # Shopify Admin GraphQL client with userError parsing
├── tests/
│   ├── appProxy.test.js        # App Proxy signature, drift, & token tests
│   ├── auth.test.js            # OAuth HMAC, state validation & token exchange
│   ├── designUpload.test.js    # End-to-end design upload, Files API & error tests
│   ├── fileValidator.test.js   # PNG magic byte & file limit tests
│   ├── health.test.js          # Health check & 404 tests
│   └── webhook.test.js         # Webhook HMAC verification & idempotency tests
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js                   # Application entrypoint
```

---

## 9. Environment Variables

Create a `.env` file in the root directory (refer to `.env.example`):

```bash
# Server
PORT=3000
NODE_ENV=production
HOST=https://your-app-name.onrender.com

# Shopify Credentials
SHOPIFY_API_KEY=your_client_id_here
SHOPIFY_API_SECRET=your_client_secret_here
SHOPIFY_APP_URL=https://your-app-name.onrender.com
SHOPIFY_API_VERSION=2025-01
SHOPIFY_SCOPES=write_files,read_files,read_products,read_orders,write_orders

# 32-Byte Secret for AES-256-GCM Token Storage
SESSION_ENCRYPTION_KEY=replace_with_a_secure_32_byte_secret_key_for_production

# Optional Direct Offline Access Token (for pre-authenticated single store development)
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_SHOP_DOMAIN=
```

---

## 10. Render Deployment Guide

1. Push this repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com/):
   - Click **New** > **Web Service**.
   - Connect your repository (`custom-product-designer-backend`).
   - Configure settings:
     - **Name**: `custom-product-designer-backend`
     - **Region**: Select closest to your merchant store.
     - **Branch**: `main`
     - **Runtime**: `Node`
     - **Build Command**:
       ```bash
       npm install
       ```
     - **Start Command**:
       ```bash
       npm start
       ```
     - **Plan**: Free or Starter (Starter recommended for production to prevent sleep).
3. Add Environment Variables in the Render settings tab:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_APP_URL` (`https://<your-render-subdomain>.onrender.com`)
   - `SESSION_ENCRYPTION_KEY` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `NODE_ENV=production`
   - `SHOPIFY_API_VERSION=2025-01`
4. (Optional) If deploying with multi-store support on Render without redeploy token resets, attach a **Persistent Disk** mounted at `/opt/render/project/src/.data`.

---

## 11. Testing & Verification

The test suite includes 31 tests covering all security, cryptographic, validation, and upload requirements:

```bash
# Run all tests
npm test
```

### Coverage Highlights:
- **Health Check**: Verifies `/health` endpoint and 404 responses.
- **File Validation**: Validates 8-byte PNG magic signature (`89 50 4E 47 0D 0A 1A 0A`), rejects corrupt files, checks size limits.
- **OAuth Security**: Verifies HMAC calculation, rejects tampered signatures, enforces state/nonce expiry, tests token exchange.
- **App Proxy Security**: Verifies Shopify's official concatenated signature algorithm, verifies timestamp drift rejection, checks token presence.
- **Design Upload & Files API**: Tests base64 decoding, product/variant validation, GraphQL staged uploads, file creation, userErrors handling, and cart property formatting.
- **Webhook Processing**: Tests raw-body HMAC-SHA256 signature verification, idempotency duplicate rejection, and customized line-item property extraction.

