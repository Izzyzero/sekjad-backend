const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

const ensureValidProductId = (productId) => {
    if (!mongoose.isObjectIdOrHexString(productId)) {
        const error = new Error('Invalid product ID');
        error.statusCode = 400;
        throw error;
    }
};

const ensureProductExists = async (productId) => {
    ensureValidProductId(productId);
    const exists = await Product.exists({ _id: productId });
    if (!exists) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
    }
};

const populateWishlist = (wishlist) => wishlist.populate({
    path: 'products',
    select: 'title slug price currency image',
});

const getWishlistDocument = async (userId) => {
    let wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) wishlist = await Wishlist.create({ user: userId, products: [] });
    return wishlist;
};

const formatWishlist = (wishlist) => {
    const result = wishlist.toObject({ virtuals: true });
    // Ignore stale references if a product was removed outside the normal flow.
    result.products = result.products.filter(Boolean);
    result.productCount = result.products.length;
    return result;
};

const getWishlist = async (userId) => {
    const wishlist = await getWishlistDocument(userId);
    await populateWishlist(wishlist);
    return formatWishlist(wishlist);
};

const addProduct = async (userId, productId) => {
    await ensureProductExists(productId);
    const wishlist = await getWishlistDocument(userId);

    if (!wishlist.products.some((id) => String(id) === String(productId))) {
        wishlist.products.push(productId);
        await wishlist.save();
    }

    await populateWishlist(wishlist);
    return formatWishlist(wishlist);
};

const removeProduct = async (userId, productId) => {
    ensureValidProductId(productId);
    const wishlist = await getWishlistDocument(userId);
    const originalLength = wishlist.products.length;
    wishlist.products = wishlist.products.filter((id) => String(id) !== String(productId));

    if (wishlist.products.length === originalLength) {
        const error = new Error('Product is not in the wishlist');
        error.statusCode = 404;
        throw error;
    }

    await wishlist.save();
    await populateWishlist(wishlist);
    return formatWishlist(wishlist);
};

const clearWishlist = async (userId) => {
    const wishlist = await getWishlistDocument(userId);
    wishlist.products = [];
    await wishlist.save();
    await populateWishlist(wishlist);
    return formatWishlist(wishlist);
};

module.exports = { getWishlist, addProduct, removeProduct, clearWishlist };
