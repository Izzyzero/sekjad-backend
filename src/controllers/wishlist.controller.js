const wishlistService = require('../services/wishlist.service');

const respond = (res, message, data) => res.status(200).json({ success: true, message, data });

const getWishlist = async (req, res, next) => {
    try {
        return respond(res, 'Wishlist retrieved successfully', await wishlistService.getWishlist(req.user._id));
    } catch (error) { return next(error); }
};

const addProduct = async (req, res, next) => {
    try {
        return respond(
            res,
            'Product added to wishlist',
            await wishlistService.addProduct(req.user._id, req.body.productId)
        );
    } catch (error) { return next(error); }
};

const removeProduct = async (req, res, next) => {
    try {
        return respond(
            res,
            'Product removed from wishlist',
            await wishlistService.removeProduct(req.user._id, req.params.productId)
        );
    } catch (error) { return next(error); }
};

const clearWishlist = async (req, res, next) => {
    try {
        return respond(
            res,
            'Wishlist cleared successfully',
            await wishlistService.clearWishlist(req.user._id)
        );
    } catch (error) { return next(error); }
};

module.exports = { getWishlist, addProduct, removeProduct, clearWishlist };
