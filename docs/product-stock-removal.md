# Products without inventory tracking

Product create/update APIs no longer validate or update `stock`. Product creation does not require or initialize inventory. Legacy stored stock values are retained but excluded from normal product queries. Existing `inStock` responses are always true, including zero-stock products; customer product detail/list responses explicitly include `inStock: true`.

WhatsApp and Paystack checkout do not gate existing products by stock quantity or product status. Product IDs must still exist, quantities must be valid, and prices remain server-calculated. Existing catalog publication filters (active versus draft/archived) remain in place; they control storefront visibility, not inventory availability.

The admin frontend is not in this workspace. In both Add Product and Edit Product forms:

- Remove the stock input, label, default value, validation, and stock error display.
- Stop appending `stock` to JSON or FormData requests.
- Remove stock-based disable rules and out-of-stock badges on product/cart/checkout screens. Do not compare the ordered quantity against stock.

Old clients that still include `stock` alongside valid product fields have it ignored. An update containing only `stock` returns the existing "Provide at least one product field to update" validation error.
