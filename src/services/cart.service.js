const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { MAX_CART_QUANTITY } = require('../utils/inputLimits');

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const idOf = (value) => String(value?._id || value);

const ensureValidId = (value, label) => {
    if (!mongoose.isObjectIdOrHexString(value)) throw fail(400, `Invalid ${label}`);
};

const getProduct = async (productId) => {
    ensureValidId(productId, 'product ID');
    const product = await Product.findById(productId);
    if (!product || product.status !== 'active') throw fail(404, 'Product not found');
    return product;
};

const validateVariant = (product, variantId) => {
    const variants = product.variants || [];
    if (variants.length && !variantId) {
        throw fail(400, 'A variant selection is required for this product');
    }
    if (!variants.length && variantId) {
        throw fail(400, 'This product does not have color variants');
    }
    if (!variantId) return null;
    ensureValidId(variantId, 'variant ID');
    const variant = variants.find((entry) => idOf(entry.variantId) === String(variantId));
    if (!variant) throw fail(400, 'The selected variant does not belong to this product');
    if (!variant.isAvailable) throw fail(400, 'The selected variant is not available');
    return variant;
};

const populateCart = (cart) => cart.populate({
    path: 'items.product',
    select: 'title slug price currency image variants',
});

const formatCart = (cart) => {
    const source = cart.toObject({ virtuals: true });
    source.items = source.items.filter((item) => item.product).map((item) => {
        const product = item.product;
        const variantId = item.variantId ? String(item.variantId) : null;
        const variant = variantId
            ? (product.variants || []).find((entry) => idOf(entry.variantId) === variantId)
            : null;
        const hasVariants = (product.variants || []).length > 0;
        const selectedImage = variant
            ? variant.image
            : (!variantId && !hasVariants ? product.image : null);
        return {
            ...item,
            cartItemId: item.cartItemId ? String(item.cartItemId) : null,
            productId: idOf(product),
            variantId,
            colorName: variant?.colorName ?? null,
            selectedImage: selectedImage
                ? { url: selectedImage.url, altText: selectedImage.altText || '' }
                : null,
            price: product.price,
        };
    });
    source.itemCount = source.items.reduce((total, item) => total + item.quantity, 0);
    source.subtotal = source.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    source.currency = source.items[0]?.product?.currency || null;
    return source;
};

const getCartDocument = async (userId) => {
    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = await Cart.create({ user: userId, items: [] });
    let addedCartItemIds = false;
    cart.items.forEach((item) => {
        if (!item.cartItemId) {
            item.cartItemId = new mongoose.Types.ObjectId();
            addedCartItemIds = true;
        }
    });
    if (addedCartItemIds) await cart.save();
    return cart;
};

const getCart = async (userId) => {
    const cart = await getCartDocument(userId);
    await populateCart(cart);
    return formatCart(cart);
};

const addItem = async (userId, productId, variantId, quantity) => {
    const product = await getProduct(productId);
    const variant = validateVariant(product, variantId);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
        throw fail(400, `Quantity must be a whole number between 1 and ${MAX_CART_QUANTITY}`);
    }
    const cart = await getCartDocument(userId);
    const item = cart.items.find((entry) => idOf(entry.product) === String(productId)
        && String(entry.variantId || '') === String(variant?.variantId || ''));
    const newQuantity = (item?.quantity || 0) + quantity;

    if (newQuantity > MAX_CART_QUANTITY) {
        throw fail(400, `Cart quantity cannot exceed ${MAX_CART_QUANTITY}`);
    }

    if (item) item.quantity = newQuantity;
    else cart.items.push({
        cartItemId: new mongoose.Types.ObjectId(),
        product: product._id,
        variantId: variant?.variantId ?? null,
        quantity,
    });

    await cart.save();
    await populateCart(cart);
    return formatCart(cart);
};

const updateItemQuantity = async (userId, cartItemId, quantity) => {
    ensureValidId(cartItemId, 'cart item ID');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
        throw fail(400, `Quantity must be a whole number between 1 and ${MAX_CART_QUANTITY}`);
    }
    const cart = await getCartDocument(userId);
    const item = cart.items.find((entry) => idOf(entry.cartItemId) === String(cartItemId));
    if (!item) throw fail(404, 'Cart item not found');

    const product = await getProduct(idOf(item.product));
    if (item.variantId) validateVariant(product, item.variantId);
    item.quantity = quantity;
    await cart.save();
    await populateCart(cart);
    return formatCart(cart);
};

const removeItem = async (userId, cartItemId) => {
    ensureValidId(cartItemId, 'cart item ID');
    const cart = await getCartDocument(userId);
    const originalLength = cart.items.length;
    cart.items = cart.items.filter((entry) => idOf(entry.cartItemId) !== String(cartItemId));
    if (cart.items.length === originalLength) throw fail(404, 'Cart item not found');
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
