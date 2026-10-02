const { randomUUID, createHmac, timingSafeEqual } = require('node:crypto');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const paystack = require('../config/paystack');
const env = require('../config/env');
const { buildCheckoutItems } = require('./checkoutItems.service');

const badRequest = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const getCallbackUrl = () => env.paystackCallbackUrl || new URL('/checkout/return', env.frontendOrigin).toString();

const initialize = async (user) => {
    if (!env.paystackEnabled) {
        const error = new Error('Online payment is disabled. Please order via WhatsApp');
        error.statusCode = 503;
        throw error;
    }
    const cart = await Cart.findOne({ user: user._id }).populate('items.product');
    if (!cart?.items.length) throw badRequest('Cart is empty');
    const { items, amount } = buildCheckoutItems(cart);

    const order = await Order.create({
        user: user._id,
        items,
        amount,
        currency: 'NGN',
        reference: `sekjad_${randomUUID()}`,
    });
    try {
        const transaction = await paystack.initialize({
            email: user.email,
            amount,
            currency: order.currency,
            reference: order.reference,
            callback_url: getCallbackUrl(),
        });
        return {
            orderId: order.id,
            reference: order.reference,
            authorizationUrl: transaction.authorization_url,
            accessCode: transaction.access_code,
            amount,
            currency: order.currency,
        };
    } catch (error) {
        await Order.updateOne({ _id: order._id, paymentStatus: 'pending' }, { paymentStatus: 'failed' });
        throw error;
    }
};

const applyVerification = async (order, transaction) => {
    if (order.paymentMethod === 'whatsapp') throw badRequest('This order is settled through WhatsApp');
    if (transaction.reference !== order.reference || transaction.amount !== order.amount || transaction.currency !== order.currency) {
        throw badRequest('Payment details do not match the order');
    }
    if (transaction.status === 'success') {
        await Order.updateOne(
            { _id: order._id, paymentStatus: { $ne: 'paid' } },
            { $set: { paymentStatus: 'paid', paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date() } }
        );
    } else if (['failed', 'abandoned', 'reversed'].includes(transaction.status)) {
        await Order.updateOne(
            // A delayed failed/abandoned response must not undo a successful webhook.
            { _id: order._id, paymentStatus: transaction.status === 'reversed' ? { $ne: 'failed' } : 'pending' },
            { $set: { paymentStatus: 'failed', paidAt: null } }
        );
    }
    return Order.findById(order._id);
};

const verify = async (reference, user) => {
    const order = await Order.findOne({ reference, user: user._id });
    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }
    if (order.paymentMethod === 'whatsapp') throw badRequest('This order is settled through WhatsApp');
    const transaction = await paystack.verify(reference);
    return applyVerification(order, transaction);
};

const webhook = async (rawBody, signature) => {
    if (!env.paystackSecretKey || !signature || !/^[a-f0-9]{128}$/i.test(signature)) {
        const error = new Error('Invalid webhook signature');
        error.statusCode = 401;
        throw error;
    }
    const expected = createHmac('sha512', env.paystackSecretKey).update(rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
        const error = new Error('Invalid webhook signature');
        error.statusCode = 401;
        throw error;
    }
    const event = JSON.parse(rawBody.toString('utf8'));
    if (event.event !== 'charge.success') return;
    const order = await Order.findOne({ reference: event.data?.reference });
    if (order) await applyVerification(order, event.data);
};

module.exports = { initialize, verify, webhook };
