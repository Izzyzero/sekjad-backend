const { MAX_CART_QUANTITY } = require('../utils/inputLimits');

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });

const buildCheckoutItems = (cart, { currency = 'NGN' } = {}) => {
    const items = cart.items.map(({ product, variantId, quantity }) => {
        if (!product) {
            throw fail('A product in your cart no longer exists. Please remove it and try again');
        }
        if (product.status !== 'active') throw fail('A product in your cart is no longer available');
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
            throw fail('Cart contains an invalid quantity');
        }
        if (product.currency !== currency) throw fail(`Only ${currency} products are supported`);

        const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
        let variant = null;
        if (hasVariants && !variantId) {
            throw fail(`Choose a color for ${product.title} before checkout`);
        }
        if (!hasVariants && variantId) {
            throw fail(`The selected color for ${product.title} is no longer available`);
        }
        if (variantId) {
            variant = product.variants.find((entry) => String(entry.variantId) === String(variantId));
            if (!variant || !variant.isAvailable) {
                throw fail(`The selected color for ${product.title} is no longer available`);
            }
        }

        const unitAmount = Math.round(product.price * 100);
        if (!Number.isSafeInteger(unitAmount) || unitAmount < 1
            || Math.abs(unitAmount / 100 - product.price) > 0.000001) {
            throw fail('Product price must have at most two decimal places and be greater than zero');
        }

        return {
            product: product._id,
            title: product.title,
            imageUrl: (variant?.image?.url || product.image?.url) ?? null,
            variantId: variant?.variantId ?? null,
            colorName: variant?.colorName ?? null,
            variantImageUrl: variant?.image?.url ?? null,
            quantity,
            unitAmount,
        };
    });
    const amount = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    if (!Number.isSafeInteger(amount) || amount < 1) throw fail('Invalid order amount');
    return { items, amount };
};

const getCartSignature = (items) => items
    .map((item) => `${item.product?._id || item.product}:${item.variantId || ''}:${item.quantity}`)
    .sort()
    .join('|');

module.exports = { buildCheckoutItems, getCartSignature };
