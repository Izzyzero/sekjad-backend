const { createHash } = require('node:crypto');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const { buildCheckoutItems, getCartSignature } = require('./checkoutItems.service');
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
            ...(item.colorName ? [`Color: ${singleLine(item.colorName)}`] : []),
            `Quantity: ${item.quantity}`,
            `Price: ${money(item.unitAmount * item.quantity, order.currency)}`,
            ...(webUrl(item.productUrl) ? [`🔗 ${webUrl(item.productUrl)}`] : []),
            ...(webUrl(item.variantImageUrl || item.imageUrl) ? [`🖼️ ${webUrl(item.variantImageUrl || item.imageUrl)}`] : []),
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
    const cart = await Cart.findOne({ user: user._id }).populate('items.product');
    if (!cart?.items.length) throw fail(400, 'Cart is empty');
    const cartSignature = getCartSignature(cart.items);
    // The same key only reuses an order when the cart's product/variant quantities match.
    const reference = `wa_${createHash('sha256')
        .update(`${user._id}:${idempotencyKey}:${cartSignature}`).digest('hex')}`;
    const existing = await Order.findOne({ user: user._id, reference });
    if (existing) return { created: false, data: handoff(existing, user, number) };

    const checkout = buildCheckoutItems(cart);
    const items = checkout.items.map((item, index) => ({
        ...item,
        imageUrl: webUrl(item.imageUrl),
        variantImageUrl: webUrl(item.variantImageUrl),
        productUrl: productLink(cart.items[index].product),
    }));
    const { amount } = checkout;
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
