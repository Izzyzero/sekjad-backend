const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Wishlist owner is required'],
            unique: true,
            immutable: true,
        },
        products: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Product',
                },
            ],
            default: [],
            validate: {
                validator(products) {
                    return new Set(products.map(String)).size === products.length;
                },
                message: 'A product cannot appear in a wishlist more than once',
            },
        },
    },
    {
        timestamps: true,
    }
);

const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;
