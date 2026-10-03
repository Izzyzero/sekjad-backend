# Product color variants and cart API

Products only have color variants when an administrator explicitly supplies them. Existing `gallery` images are not converted into variants. A variant has a stable server-generated `variantId`, `colorName`, image metadata, and an `isAvailable` flag. There is no per-variant stock count in this backend.

All product and cart prices come from the product record and are calculated by the server. Cart `price` uses the product currency's major unit (for example, `1250` NGN); saved order `unitAmount` and `amount` use minor units (`125000` kobo).

## Admin: create or edit variants

Product create and edit endpoints accept JSON or `multipart/form-data` (admin authentication required). For multipart requests, send scalar fields such as `title`, `description`, `price`, `brand`, and `currency` as normal form fields; repeat `categories[]` once per category ID and `tags[]` once per tag. Attach the primary file as `image` and optional files as repeated `gallery` fields (maximum 10). Send `variants` as a JSON-encoded array string. Creation requires `title`, `description`, `price`, at least one category, and either an `image` file or an `image.url` in a JSON request. An edit can omit `image` to keep the current product image. Uploaded images are stored by the backend and returned as `{ "url", "publicId", "altText" }`.

Create a product with `POST /api/v1/products` by adding `variants` to the product request. Omit `variantId` for new variants; the server assigns it:

```http
POST /api/v1/products
Authorization: Bearer <admin-token>
Content-Type: application/json
```

```json
{
  "title": "Everyday Bag",
  "description": "A durable everyday bag.",
  "price": 1250,
  "categories": ["507f1f77bcf86cd799439011"],
  "image": { "url": "https://images.example/bag.jpg", "altText": "Everyday Bag" },
  "gallery": [{ "url": "https://images.example/detail.jpg", "altText": "Bag detail" }],
  "variants": [
    {
      "colorName": "Red",
      "image": { "url": "https://images.example/bag-red.jpg", "altText": "Red bag" },
      "isAvailable": true
    },
    {
      "colorName": "Blue",
      "image": { "url": "https://images.example/bag-blue.jpg", "altText": "Blue bag" },
      "isAvailable": true
    }
  ]
}
```

To edit, send `PATCH /api/v1/products/:id` with the complete replacement `variants` array. Keep each existing `variantId` unchanged; omit it only for a newly added variant. Omit a variant from the array to remove it. Sending `variants: []` removes all variants. `isAvailable: false` prevents adding/checking out that color.

```http
PATCH /api/v1/products/507f1f77bcf86cd799439012
Authorization: Bearer <admin-token>
Content-Type: application/json
```

```json
{
  "variants": [
    {
      "variantId": "507f1f77bcf86cd799439101",
      "colorName": "Red",
      "image": { "url": "https://images.example/bag-red-new.jpg", "altText": "Red bag" },
      "isAvailable": true
    },
    {
      "colorName": "Green",
      "image": { "url": "https://images.example/bag-green.jpg", "altText": "Green bag" },
      "isAvailable": false
    }
  ]
}
```

The successful create/update response uses `{ "success": true, "message": "...", "data": <product> }`; the product's `variants` array includes the assigned/preserved IDs. Image objects use `{ "url", "publicId", "altText" }`.

For example, the update response includes the saved variant IDs:

```json
{
  "success": true,
  "message": "Product updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "title": "Everyday Bag",
    "variants": [
      {
        "variantId": "507f1f77bcf86cd799439101",
        "colorName": "Red",
        "image": { "url": "https://images.example/bag-red-new.jpg", "publicId": null, "altText": "Red bag" },
        "isAvailable": true
      },
      {
        "variantId": "507f1f77bcf86cd799439102",
        "colorName": "Green",
        "image": { "url": "https://images.example/bag-green.jpg", "publicId": null, "altText": "" },
        "isAvailable": false
      }
    ]
  }
}
```

## Product detail

`GET /api/v1/products/:id` returns the variant array as part of `data`. Product detail currently requires authentication.

```json
{
  "success": true,
  "message": "Product retrieved successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "title": "Everyday Bag",
    "price": 1250,
    "currency": "NGN",
    "image": { "url": "https://images.example/bag.jpg", "altText": "Everyday Bag" },
    "gallery": [{ "url": "https://images.example/detail.jpg", "altText": "Bag detail" }],
    "variants": [
      {
        "variantId": "507f1f77bcf86cd799439101",
        "colorName": "Red",
        "image": { "url": "https://images.example/bag-red.jpg", "altText": "Red bag" },
        "isAvailable": true
      }
    ]
  }
}
```

Render color choices from `variants`, and submit the selected `variantId` only when the customer picks a color. Do not infer colors from `gallery`.

## Cart

All cart endpoints require customer authentication.

### Add a line: `POST /api/v1/cart/items`

`variantId` is optional for every product. Omit it to add the main product using its primary image and price; provide it to add a selected color. `quantity` is optional and defaults to `1`.

```json
{ "productId": "507f1f77bcf86cd799439012", "quantity": 1 }
```

To add a selected color:

```json
{ "productId": "507f1f77bcf86cd799439012", "variantId": "507f1f77bcf86cd799439101", "quantity": 2 }
```

Successful response:

```json
{
  "success": true,
  "message": "Product added to cart",
  "data": {
    "items": [
      {
        "cartItemId": "507f1f77bcf86cd799439201",
        "productId": "507f1f77bcf86cd799439012",
        "variantId": "507f1f77bcf86cd799439101",
        "colorName": "Red",
        "selectedImage": { "url": "https://images.example/bag-red.jpg", "altText": "Red bag" },
        "quantity": 2,
        "price": 1250,
        "product": { "_id": "507f1f77bcf86cd799439012", "title": "Everyday Bag", "price": 1250, "currency": "NGN" }
      }
    ],
    "itemCount": 2,
    "subtotal": 2500,
    "currency": "NGN"
  }
}
```

Repeated adds merge only when both `productId` and `variantId` match. The main product (`variantId: null`), Blue, and Gold therefore occupy separate lines and each has its own `cartItemId`. The main product has `colorName: null` and uses the primary product image; selected colors use their variant image. All lines use the product's server-side price. A supplied variant must belong to that product and be available.

### Read: `GET /api/v1/cart`

Returns the same cart envelope and line fields as the add response. Each line has its own `cartItemId`.

### Set quantity: `PATCH /api/v1/cart/items/:cartItemId`

```json
{ "quantity": 3 }
```

### Remove one line: `DELETE /api/v1/cart/items/:cartItemId`

For both update and remove, the response is the same `{ "success": true, "message": "...", "data": <updated cart> }` shape as the add response. For example, after updating or removing the red line above, the remaining cart can be:

```json
{
  "success": true,
  "message": "Cart quantity updated",
  "data": {
    "items": [
      {
        "cartItemId": "507f1f77bcf86cd799439202",
        "productId": "507f1f77bcf86cd799439012",
        "variantId": "507f1f77bcf86cd799439102",
        "colorName": "Blue",
        "selectedImage": { "url": "https://images.example/bag-blue.jpg", "altText": "Blue bag" },
        "quantity": 1,
        "price": 1250
      }
    ],
    "itemCount": 1,
    "subtotal": 1250,
    "currency": "NGN"
  }
}
```

`DELETE /api/v1/cart/items/:cartItemId` has message `"Product removed from cart"` and returns the same updated-cart data shape. Update and remove target only the supplied cart line. `DELETE /api/v1/cart` continues to clear the complete cart.

The server rejects a variant from another product or an unavailable variant with `400`. Omitting `variantId` selects the main product, including for products that have variants. It rejects unknown cart item IDs with `404`. Existing cart lines with no variant remain main-product lines; no color is inferred from the product's variants.

## Checkout and orders

WhatsApp checkout remains `POST /api/v1/orders/whatsapp`, with a UUID `Idempotency-Key` header and an empty JSON body. Paystack initialization, when enabled, remains `POST /api/v1/payments/initialize`; it uses the same server-side variant validation and item snapshots.

The WhatsApp response's order lines include variant snapshots. The main product is snapshotted with `variantId: null`, `colorName: null`, `imageUrl` set to the main image, and `variantImageUrl: null`. A selected color records its variant ID/name and uses the variant image:

```json
{
  "success": true,
  "message": "Order prepared. Open WhatsApp and send the message to arrange payment",
  "data": {
    "orderId": "507f1f77bcf86cd799439301",
    "reference": "wa_<unique-order-reference>",
    "items": [
      {
        "product": "507f1f77bcf86cd799439012",
        "title": "Everyday Bag",
        "imageUrl": "https://images.example/bag-red.jpg",
        "productUrl": "https://sekjad.com/product/everyday-bag",
        "variantId": "507f1f77bcf86cd799439101",
        "colorName": "Red",
        "variantImageUrl": "https://images.example/bag-red.jpg",
        "quantity": 2,
        "unitAmount": 125000
      }
    ],
    "amount": 250000,
    "currency": "NGN",
    "paymentMethod": "whatsapp",
    "paymentStatus": "pending",
    "message": "🛍️ *SEKJAD ORDER REQUEST*\\n\\n1️⃣ Everyday Bag\\nColor: Red\\nQuantity: 2\\nPrice: ₦2,500\\n...",
    "whatsappUrl": "https://wa.me/<business-number>?text=<encoded-order-details>"
  }
}
```

The WhatsApp message includes `Color: <colorName>` for a selected color, and `Selection: Main product` when no variant was selected. It uses the corresponding main or variant image link. Order items snapshot the nullable `variantId`, nullable `colorName`, `variantImageUrl`, image URL, quantity, and server-calculated unit price, preserving the distinction for customer and admin order reads.

Customer order endpoints (`GET /api/v1/orders`, `GET /api/v1/orders/:id`) and admin order endpoints (`GET /api/v1/admin/orders`, `GET /api/v1/admin/orders/:id`) return the saved item snapshots unchanged, including `variantId`, `colorName`, and `variantImageUrl`.

Retries using the same idempotency key and the same cart product/variant/quantity lines return the existing order. A changed variant cart produces a different order reference, even when the frontend reuses that key.

## Deployment and existing data

- No destructive migration or gallery conversion is needed. MongoDB adds the new optional product fields as documents are created/edited; legacy products behave as products with `variants: []`.
- Existing cart item documents remain readable. Cart-line IDs are assigned on access for legacy lines if missing. No old cart item is assigned a color automatically; a line with no `variantId` continues to represent the main product.
- No data migration is required. Deploy the backend to allow main-product lines for products with variants; existing variant selections and cart-line IDs remain unchanged.
- Variant availability is tracked with `isAvailable`. This schema does not track per-variant quantity stock or reserve/decrement inventory.
