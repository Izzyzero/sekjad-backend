const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: [true, 'Cart product is required'],
        },
        quantity: {
            type: Number,
            required: true,
            min: [1, 'Cart quantity must be at least 1'],
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
                    return new Set(items.map((item) => String(item.product))).size === items.length;
                },
                message: 'A product cannot appear in a cart more than once',
            },
        },
    },
    { timestamps: true }
);

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

module.exports = Cart;
