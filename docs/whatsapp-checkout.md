# Order via WhatsApp

New Paystack checkout initialization is disabled unless `PAYSTACK_ENABLED=true`. Existing Paystack verification/webhooks remain available for earlier transactions. WhatsApp checkout never calls Paystack or collects card details.

## Configuration

Set `WHATSAPP_ORDER_NUMBER` to the store's full international number (digits, optionally prefixed by `+`; no spaces or national leading zero). Restart the backend after changing `.env`. Missing/invalid configuration returns `503` without creating an order.

## Checkout API

After showing the cart review, the frontend's **Order via WhatsApp** button should call:

```http
POST /api/v1/orders/whatsapp
Authorization: Bearer <accessToken>
Idempotency-Key: <UUID generated once for this checkout attempt>
Content-Type: application/json

{}
```

The server reads only the authenticated user's saved cart. Client-supplied products, prices, totals, user IDs and payment statuses are ignored. All existing products can be ordered without stock or availability checks. Quantities and NGN prices are still validated; deleted/missing products must be removed from the cart. The server saves an order snapshot using the existing minor-unit amount convention. Shipping charges are agreed on WhatsApp and are not included in the items total.

`201` response (`200` when retrying the same attempt):

```json
{
  "success": true,
  "message": "Order prepared. Open WhatsApp and send the message to arrange payment",
  "data": {
    "orderId": "507f1f77bcf86cd799439013",
    "reference": "wa_<unique-order-reference>",
    "items": [
      { "product": "507f1f77bcf86cd799439012", "title": "Bag", "imageUrl": null, "quantity": 2, "unitAmount": 1250 }
    ],
    "amount": 2500,
    "currency": "NGN",
    "paymentMethod": "whatsapp",
    "paymentStatus": "pending",
    "message": "Hello, I would like to place this order: ...",
    "whatsappUrl": "https://wa.me/<business-number>?text=<encoded-order-details>"
  }
}
```

The message uses the `🛍️ *SEKJAD ORDER REQUEST*` heading, numbered items, quantities, `Price` (the whole line's total), product links, image links, and a bold naira total. Order reference and customer contact details appear at the bottom. No message is sent by the backend: the customer opens WhatsApp and presses **Send**.

Product links use `FRONTEND_ORIGIN` (falling back to `BASE_URL`) followed by `/product/<slug>`, or the product ID if no slug is present. Configure that origin to the publicly accessible storefront in production. Product and primary-image URLs are saved with each new order. Previous order snapshots without product URLs still work but do not gain product links retroactively. Missing images are omitted. Start a new checkout attempt to capture current product links/images.

Example item:

```text
🛍️ *SEKJAD ORDER REQUEST*

1️⃣ Lace Fabric
Quantity: 3
Price: ₦45,000
🔗 https://sekjad.com/product/lace-001
🖼️ https://your-image-host.example/lace.jpg

💰 *Total: ₦45,000*
Please confirm my order.
```

The WhatsApp click-to-chat URL prefills text and links, not photo attachments. Image links are clickable; previews depend on WhatsApp and are not guaranteed for every item. No WhatsApp media-upload API is used.

Opening WhatsApp does not prove a message was sent or payment received. The order remains `pending`, the cart stays intact, and stock is not reserved/decremented. Existing customer/admin order endpoints include the pending order with `paymentMethod: "whatsapp"`. Payment happens separately in the conversation; this change does not add automatic reconciliation or an admin payment-confirmation endpoint. Staff should use the saved order reference and server total when agreeing payment, because customers can edit the WhatsApp message.

Retries with the same UUID return the same order snapshot, including after cart edits. Generate a new UUID after the customer changes/reviews the cart or explicitly starts a new order. Disable the button while the request is running. The unique reference also prevents concurrent retries from saving duplicates. The endpoint allows 10 attempts per 15 minutes per IP.

## Frontend integration

This workspace contains only the backend. In the frontend checkout/cart review page, replace the Paystack initialize handler and button with this flow:

```js
// Keep this key in component state/ref or session storage across network retries.
const checkoutKey = crypto.randomUUID();

async function orderViaWhatsApp(accessToken) {
  const response = await fetch(`${API_ORIGIN}/api/v1/orders/whatsapp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': checkoutKey,
    },
    body: JSON.stringify({}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message);
  // Save result.data for a visible "Open WhatsApp" link and "Copy order" fallback.
  // Same-tab navigation avoids popup blockers after an asynchronous request.
  window.location.assign(result.data.whatsappUrl);
}
```

Keep the returned message available for copying if WhatsApp cannot open or the cart produces a long link. Do not automatically clear the cart or display “payment successful.” Show “Send your order in WhatsApp to arrange payment.” Use the existing authenticated cart APIs to persist the reviewed cart before submitting.

Errors follow `{ "success": false, "message": "..." }`, with `errors` on UUID validation failures: `400` invalid cart/key, `401` authentication required, `429` rate limit, `503` WhatsApp configuration missing. The legacy `POST /api/v1/payments/initialize` now returns `503` while Paystack is disabled; the frontend must switch to the new endpoint.
