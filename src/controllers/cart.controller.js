const cartService = require('../services/cart.service');

const respond = (res, message, data) => res.status(200).json({ success: true, message, data });

const getCart = async (req, res, next) => {
    try {
        return respond(res, 'Cart retrieved successfully', await cartService.getCart(req.user._id));
    } catch (error) { return next(error); }
};

const addItem = async (req, res, next) => {
    try {
        const cart = await cartService.addItem(req.user._id, req.body.productId, req.body.quantity ?? 1);
        return respond(res, 'Product added to cart', cart);
    } catch (error) { return next(error); }
};

const updateItemQuantity = async (req, res, next) => {
    try {
        const cart = await cartService.updateItemQuantity(req.user._id, req.params.productId, req.body.quantity);
        return respond(res, 'Cart quantity updated', cart);
    } catch (error) { return next(error); }
};

const removeItem = async (req, res, next) => {
    try {
        return respond(res, 'Product removed from cart', await cartService.removeItem(req.user._id, req.params.productId));
    } catch (error) { return next(error); }
};

const clearCart = async (req, res, next) => {
    try {
        return respond(res, 'Cart cleared successfully', await cartService.clearCart(req.user._id));
    } catch (error) { return next(error); }
};

module.exports = { getCart, addItem, updateItemQuantity, removeItem, clearCart };
