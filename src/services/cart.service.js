const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

const ensureValidProductId = (productId) => {
    if (!mongoose.isObjectIdOrHexString(productId)) {
        const error = new Error('Invalid product ID');
        error.statusCode = 400;
        throw error;
    }
};

const getProduct = async (productId) => {
    ensureValidProductId(productId);
    const product = await Product.findById(productId);
    if (!product) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
    }
    return product;
};

const populateCart = (cart) => cart.populate({
    path: 'items.product',
    select: 'title slug price currency image',
});

const formatCart = (cart) => {
    const source = cart.toObject({ virtuals: true });
    source.items = source.items.filter((item) => item.product);
    source.itemCount = source.items.reduce((total, item) => total + item.quantity, 0);
    source.subtotal = source.items.reduce(
        (total, item) => total + (item.product.price * item.quantity),
        0
    );
    source.currency = source.items[0]?.product?.currency || null;
    return source;
};

const getCartDocument = async (userId) => {
    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = await Cart.create({ user: userId, items: [] });
    return cart;
};

const getCart = async (userId) => {
    const cart = await getCartDocument(userId);
    await populateCart(cart);
    return formatCart(cart);
};

const addItem = async (userId, productId, quantity) => {
    const product = await getProduct(productId);
    const cart = await getCartDocument(userId);
    const item = cart.items.find((entry) => String(entry.product) === String(productId));
    const newQuantity = (item?.quantity || 0) + quantity;

    if (item) item.quantity = newQuantity;
    else cart.items.push({ product: product._id, quantity });

    await cart.save();
    await populateCart(cart);
    return formatCart(cart);
};

const updateItemQuantity = async (userId, productId, quantity) => {
    await getProduct(productId);
    const cart = await getCartDocument(userId);
    const item = cart.items.find((entry) => String(entry.product) === String(productId));

    if (!item) {
        const error = new Error('Product is not in the cart');
        error.statusCode = 404;
        throw error;
    }
    item.quantity = quantity;
    await cart.save();
    await populateCart(cart);
    return formatCart(cart);
};

const removeItem = async (userId, productId) => {
    ensureValidProductId(productId);
    const cart = await getCartDocument(userId);
    const originalLength = cart.items.length;
    cart.items = cart.items.filter((entry) => String(entry.product) !== String(productId));

    if (cart.items.length === originalLength) {
        const error = new Error('Product is not in the cart');
        error.statusCode = 404;
        throw error;
    }

    await cart.save();
    await populateCart(cart);
    return formatCart(cart);
};

const clearCart = async (userId) => {
    const cart = await getCartDocument(userId);
    cart.items = [];
    await cart.save();
    await populateCart(cart);
    return formatCart(cart);
};

module.exports = { getCart, addItem, updateItemQuantity, removeItem, clearCart };
