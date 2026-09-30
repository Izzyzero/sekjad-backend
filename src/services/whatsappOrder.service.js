const { createHash } = require('node:crypto');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const { MAX_CART_QUANTITY } = require('../utils/inputLimits');
const env = require('../config/env');

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const singleLine = (value) => String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
const money = (amount, currency) => new Intl.NumberFormat('en-NG', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
}).format(amount / 100);
const numberLabel = (number) => String(number).split('').map((digit) => `${digit}\uFE0F\u20E3`).join('');
const webUrl = (value) => {
    if (!value) return null;
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
};
const productLink = (product) => {
    const origin = webUrl(env.frontendOrigin);
    if (!origin) throw fail(503, 'Store website URL is not configured');
    return new URL(`/product/${encodeURIComponent(product.slug || String(product._id))}`, origin).href;
};

const handoff = (order, user, number) => {
    const message = [
        '🛍️ *SEKJAD ORDER REQUEST*',
        '',
        ...order.items.flatMap((item, index) => [
            `${numberLabel(index + 1)} ${singleLine(item.title)}`,
            `Quantity: ${item.quantity}`,
            `Price: ${money(item.unitAmount * item.quantity, order.currency)}`,
            ...(webUrl(item.productUrl) ? [`🔗 ${webUrl(item.productUrl)}`] : []),
            ...(webUrl(item.imageUrl) ? [`🖼️ ${webUrl(item.imageUrl)}`] : []),
            '',
        ]),
        `💰 *Total: ${money(order.amount, order.currency)}*`,
        'Please confirm my order.',
        'Delivery and payment will be arranged on WhatsApp.',
        '',
        `Order reference: ${order.reference}`,
        `Customer: ${singleLine(user.firstName)} ${singleLine(user.lastName)}`,
        ...(user.phoneNumber ? [`Phone: ${singleLine(user.phoneNumber)}`] : []),
    ].join('\n');
    return {
        orderId: String(order._id), reference: order.reference,
        items: order.items, amount: order.amount, currency: order.currency,
        paymentMethod: 'whatsapp', paymentStatus: order.paymentStatus,
        message, whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
    };
};

const create = async (user, idempotencyKey) => {
    const number = String(env.whatsappOrderNumber || '').trim().replace(/^\+/, '');
    if (!/^[1-9]\d{7,14}$/.test(number)) {
        throw fail(503, 'WhatsApp ordering is not configured. Please contact the store');
    }
    // Scoped to the authenticated account; retries reuse the saved order snapshot.
    const reference = `wa_${createHash('sha256').update(`${user._id}:${idempotencyKey}`).digest('hex')}`;
    const existing = await Order.findOne({ user: user._id, reference });
    if (existing) return { created: false, data: handoff(existing, user, number) };

    const cart = await Cart.findOne({ user: user._id }).populate('items.product');
    if (!cart?.items.length) throw fail(400, 'Cart is empty');
    const items = cart.items.map(({ product, quantity }) => {
        if (!product) {
            throw fail(400, 'A product in your cart no longer exists. Please remove it and try again');
        }
        if (product.status !== 'active') throw fail(400, 'A product in your cart is no longer available');
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
            throw fail(400, 'Cart contains an invalid quantity');
        }
        if (product.currency !== 'NGN') throw fail(400, 'Only NGN products are supported');
        const unitAmount = Math.round(product.price * 100);
        if (!Number.isSafeInteger(unitAmount) || unitAmount < 1 || Math.abs(unitAmount / 100 - product.price) > 0.000001) {
            throw fail(400, 'Product price must have at most two decimal places and be greater than zero');
        }
        return {
            product: product._id, title: product.title,
            imageUrl: webUrl(product.image?.url), productUrl: productLink(product),
            quantity, unitAmount,
        };
    });
    const amount = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    if (!Number.isSafeInteger(amount) || amount < 1) throw fail(400, 'Invalid order amount');
    try {
        const order = await Order.create({
            user: user._id, items, amount, currency: 'NGN', reference,
            paymentMethod: 'whatsapp', paymentStatus: 'pending',
        });
        return { created: true, data: handoff(order, user, number) };
    } catch (error) {
        if (error.code !== 11000) throw error;
        const order = await Order.findOne({ user: user._id, reference });
        if (!order) throw error;
        return { created: false, data: handoff(order, user, number) };
    }
};

module.exports = { create };
