const mongoose = require('mongoose');
const Order = require('../models/Order');

const STATUS = Object.freeze({ paid: 'successful', failed: 'cancelled', pending: 'pending' });
const formatOrder = (order) => ({ ...order, status: STATUS[order.paymentStatus] });

const listOrders = async (userId, query = {}) => {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        const error = new Error('Page and limit must be positive integers; limit cannot exceed 100');
        error.statusCode = 400;
        throw error;
    }
    const filter = { user: userId };
    if (query.status !== undefined) {
        const statusToPayment = { successful: 'paid', cancelled: 'failed', pending: 'pending' };
        if (!Object.hasOwn(statusToPayment, query.status)) {
            const error = new Error('Status must be successful, cancelled, or pending');
            error.statusCode = 400;
            throw error;
        }
        filter.paymentStatus = statusToPayment[query.status];
    }
    const [orders, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Order.countDocuments(filter),
    ]);
    return {
        orders: orders.map(formatOrder),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
};

const listAdminOrders = async (query = {}) => {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        const error = new Error('Page and limit must be positive integers; limit cannot exceed 100');
        error.statusCode = 400;
        throw error;
    }
    const filter = {};
    if (query.status !== undefined) {
        const statusToPayment = { successful: 'paid', cancelled: 'failed', pending: 'pending' };
        if (!Object.hasOwn(statusToPayment, query.status)) {
            const error = new Error('Status must be successful, cancelled, or pending');
            error.statusCode = 400;
            throw error;
        }
        filter.paymentStatus = statusToPayment[query.status];
    }
    const [orders, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
            .populate('user', 'firstName lastName email').lean(),
        Order.countDocuments(filter),
    ]);
    return { items: orders.map(formatOrder), total, page, limit, pages: Math.ceil(total / limit) };
};

const getOrder = async (userId, orderId) => {
    if (!mongoose.isObjectIdOrHexString(orderId)) {
        const error = new Error('Invalid order ID');
        error.statusCode = 400;
        throw error;
    }
    const order = await Order.findOne({ _id: orderId, user: userId }).lean();
    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }
    return formatOrder(order);
};

const getAdminOrder = async (orderId) => {
    if (!mongoose.isObjectIdOrHexString(orderId)) {
        const error = new Error('Invalid order ID');
        error.statusCode = 400;
        throw error;
    }
    const order = await Order.findById(orderId)
        .populate('user', 'firstName lastName email').lean();
    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }
    return formatOrder(order);
};

const confirmWhatsAppPayment = async (orderId) => {
    if (!mongoose.isObjectIdOrHexString(orderId)) {
        const error = new Error('Invalid order ID');
        error.statusCode = 400;
        throw error;
    }

    const order = await Order.findById(orderId).exec();
    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    if (order.paymentMethod !== 'whatsapp') {
        const error = new Error('Only WhatsApp orders can be confirmed manually');
        error.statusCode = 400;
        throw error;
    }

    if (order.paymentStatus !== 'pending') {
        const error = new Error('Only pending WhatsApp orders can be confirmed');
        error.statusCode = 400;
        throw error;
    }

    const updatedOrder = await Order.findOneAndUpdate(
        { _id: orderId, paymentMethod: 'whatsapp', paymentStatus: 'pending' },
        {
            $set: {
                paymentStatus: 'paid',
                paidAt: new Date(),
            },
        },
        { new: true }
    );

    if (!updatedOrder) {
        const error = new Error('Order could not be confirmed');
        error.statusCode = 400;
        throw error;
    }

    return formatOrder(updatedOrder.toObject ? updatedOrder.toObject() : updatedOrder);
};

module.exports = { listOrders, listAdminOrders, getOrder, getAdminOrder, confirmWhatsAppPayment };
