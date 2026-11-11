# Storefront Integration Guide: Horizon Theme + Konva.js Customizer

This guide outlines how your existing frontend (Konva.js + Vanilla JS in the Shopify Horizon theme) communicates with the backend via the **Shopify App Proxy**.

---

## 1. App Proxy Endpoint Architecture

When using Shopify App Proxy, your storefront JavaScript calls your local store domain:
```
POST https://your-store.myshopify.com/apps/product-designer/upload-design
```

Shopify intercepts this request, cryptographically signs it with your app secret, and forwards it to your backend:
```
POST https://<your-backend>.onrender.com/api/proxy/upload-design?<shopify-query-params>
```

### Advantages:
- **No CORS issues**: Requests are made directly to the store's domain.
- **No credentials exposed**: The frontend never has access to Admin API tokens or secrets.
- **Automatic authentication**: Shopify guarantees the shop and signature are authentic.

---

## 2. Storefront "Add to Cart" Integration Pattern

In your existing customizer script (e.g. `assets/customizer.js` or inside your Liquid section), hook into the "Add to Cart" button:

```javascript
/**
 * Export Konva designs, upload to backend via App Proxy, and add to Shopify Cart.
 * 
 * @param {object} params
 * @param {Konva.Stage} params.frontStage - Konva Stage for front design
 * @param {Konva.Stage} params.backStage - Konva Stage for back design
 * @param {string|number} params.productId - Shopify Product ID
 * @param {string|number} params.variantId - Selected Shopify Variant ID
 * @param {string} params.selectedColor - Color variant title (e.g. "Black")
 * @param {string} params.selectedSize - Size variant title (e.g. "XL")
 * @param {Array} params.textElements - Text configuration array
 * @param {Array} params.logoElements - Logo/image references array
 */
async function handleAddToCart({
  frontStage,
  backStage,
  productId,
  variantId,
  selectedColor,
  selectedSize,
  textElements = [],
  logoElements = []
}) {
  const submitButton = document.querySelector('#customizer-add-to-cart-btn');
  const originalButtonText = submitButton ? submitButton.innerText : 'Add to Cart';

  try {
    // 1. Show loading state to customer
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerText = 'Preparing your design...';
    }

    // 2. Export Front and Back canvas designs as high-res PNG data URLs
    const frontDataUrl = frontStage.toDataURL({
      mimeType: 'image/png',
      pixelRatio: 2 // High-res export for print quality
    });

    const backDataUrl = backStage.toDataURL({
      mimeType: 'image/png',
      pixelRatio: 2
    });

    // 3. Post to Shopify App Proxy endpoint
    const uploadResponse = await fetch('/apps/product-designer/upload-design', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        productId: productId,
        variantId: variantId,
        selectedColor: selectedColor,
        selectedSize: selectedSize,
        frontImage: frontDataUrl,
        backImage: backDataUrl,
        textConfiguration: textElements,
        logoReferences: logoElements
      })
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.error || 'Failed to upload custom design');
    }

    const uploadResult = await uploadResponse.json();

    if (!uploadResult.success) {
      throw new Error(uploadResult.error || 'Design upload failed');
    }

    // 4. Update button text during cart addition
    if (submitButton) {
      submitButton.innerText = 'Adding to cart...';
    }

    // 5. Add to Shopify Cart with line item properties
    // The variant ID remains the actual purchasable variant in your store!
    const cartResponse = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            id: variantId,
            quantity: 1,
            properties: uploadResult.cartProperties
          }
        ]
      })
    });

    if (!cartResponse.ok) {
      throw new Error('Failed to add customized item to cart.');
    }

    const addedItem = await cartResponse.json();

    // 6. Refresh Horizon theme cart drawer
    // The Horizon theme listens for cart updates to open the drawer
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { item: addedItem } }));

    // If your theme uses Shopify's Cart Drawer or routes to /cart:
    if (window.routes && window.routes.cart_url) {
      window.location.href = window.routes.cart_url;
    } else {
      window.location.href = '/cart';
    }

  } catch (error) {
    console.error('Customizer submission error:', error);
    alert(`Could not save your design: ${error.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerText = originalButtonText;
    }
  }
}
```

---

## 3. Resulting Cart Line Item Properties

When an item is added to the cart, the backend creates the following properties:

```json
{
  "_custom_design_id": "des_mwbwq9rx_e632e8d5",
  "Front Design URL": "https://cdn.shopify.com/s/files/1/0000/0001/files/design_..._front.png",
  "Back Design URL": "https://cdn.shopify.com/s/files/1/0000/0001/files/design_..._back.png",
  "Selected color": "Black",
  "Selected size": "XL",
  "_design_meta_url": "https://cdn.shopify.com/s/files/1/0000/0001/files/design_..._meta.json"
}
```

### Visual Customer Experience in Horizon:
- **`Front Design URL`** and **`Back Design URL`** appear as clickable links under the line item in the cart drawer, cart page, and order confirmation email.
- **`Selected color`** and **`Selected size`** display clearly for fulfillment.
- **`_custom_design_id`** and **`_design_meta_url`** are hidden from customers in standard Shopify themes because they start with an underscore (`_`), but they are completely visible to store staff and fulfillment webhooks in the Shopify Admin.

