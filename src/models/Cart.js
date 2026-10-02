const mongoose = require('mongoose');
const { MAX_CART_QUANTITY } = require('../utils/inputLimits');

const cartItemSchema = new mongoose.Schema(
    {
        cartItemId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: [true, 'Cart product is required'],
        },
        variantId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        quantity: {
            type: Number,
            required: true,
            min: [1, 'Cart quantity must be at least 1'],
            max: [MAX_CART_QUANTITY, `Cart quantity cannot exceed ${MAX_CART_QUANTITY}`],
            validate: {
                validator: Number.isInteger,
                message: 'Cart quantity must be a whole number',
            },
        },
    },
    { _id: false }
);

const cartSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Cart owner is required'],
            unique: true,
            immutable: true,
        },
        items: {
            type: [cartItemSchema],
            default: [],
            validate: {
                validator(items) {
                    const identities = items.map((item) => `${item.product}:${item.variantId || ''}`);
                    return new Set(identities).size === identities.length;
                },
                message: 'A product variant cannot appear in a cart more than once',
            },
        },
    },
    { timestamps: true }
);

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

module.exports = Cart;
