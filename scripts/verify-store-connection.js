#!/usr/bin/env node
/**
 * Diagnostic tool to verify live Shopify Admin API connectivity.
 *
 * Usage:
 *   node scripts/verify-store-connection.js
 */
const env = require('../config/env');
const tokenStorageService = require('../services/tokenStorageService');
const { executeShopifyGraphQL } = require('../utils/shopifyGql');

const CHECK_SHOP_QUERY = `
  query GetShopDetails {
    shop {
      id
      name
      email
      myshopifyDomain
      currencyCode
      plan {
        displayName
      }
    }
  }
`;

async function main() {
  console.log('\n🔍 =========================================================');
  console.log('   SHOPIFY BACKEND CONNECTIVITY & CREDENTIALS CHECK');
  console.log('=========================================================\n');

  console.log(`[Config] NODE_ENV:            ${env.NODE_ENV}`);
  console.log(`[Config] Port:                ${env.PORT}`);
  console.log(`[Config] App URL:             ${env.SHOPIFY_APP_URL}`);
  console.log(`[Config] API Version:         ${env.SHOPIFY_API_VERSION}`);
  console.log(`[Config] Configured Scopes:   ${env.SHOPIFY_SCOPES.join(', ')}`);

  const hasApiKey = Boolean(env.SHOPIFY_API_KEY && env.SHOPIFY_API_KEY !== 'your_shopify_client_id_here');
  const hasApiSecret = Boolean(env.SHOPIFY_API_SECRET && env.SHOPIFY_API_SECRET !== 'your_shopify_client_secret_here');

  console.log(`[Credentials] Client ID:      ${hasApiKey ? '✅ Configured' : '❌ Missing / Default'}`);
  console.log(`[Credentials] Client Secret:  ${hasApiSecret ? '✅ Configured' : '❌ Missing / Default'}`);

  const targetShop = env.SHOPIFY_SHOP_DOMAIN || 'your-store.myshopify.com';
  console.log(`[Target Store] Domain:        ${targetShop}`);

  const token = tokenStorageService.getToken(targetShop);

  if (!token) {
    console.log(`\n⚠️  No offline access token found for store: ${targetShop}`);
    console.log('   To complete installation:');
    console.log(`   1. Start server: npm run dev`);
    console.log(`   2. Visit in browser: http://localhost:${env.PORT}/auth?shop=${targetShop}`);
    console.log(`   3. Authorize the app on Shopify.\n`);
    process.exit(0);
  }

  console.log('🔑 Offline token found in secure storage. Testing Admin GraphQL API...');

  try {
    const data = await executeShopifyGraphQL({
      shop: targetShop,
      accessToken: token,
      query: CHECK_SHOP_QUERY
    });

    console.log('\n🎉 =========================================================');
    console.log('   SUCCESSFULLY CONNECTED TO SHOPIFY ADMIN API!');
    console.log('=========================================================');
    console.log(`   Store Name:     ${data.shop.name}`);
    console.log(`   Domain:         ${data.shop.myshopifyDomain}`);
    console.log(`   Contact Email:  ${data.shop.email}`);
    console.log(`   Currency:       ${data.shop.currencyCode}`);
    console.log(`   Shopify Plan:   ${data.shop.plan.displayName}\n`);
  } catch (err) {
    console.error('\n❌ Connection test failed:', err.message);
    process.exit(1);
  }
}

main();

