const User = require('../models/User');
const Product = require('../models/Product');
const { USER_ROLES } = require('../models/User');
const Order = require('../models/Order');

const RANGE_DAYS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90 });

const getDashboard = async (range = '30d') => {
    if (!Object.hasOwn(RANGE_DAYS, range)) {
        const error = new Error('Range must be one of: 7d, 30d, 90d');
        error.statusCode = 400;
        throw error;
    }

    const since = new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
    const [totalCustomers, totalProducts, totalOrders, revenue] = await Promise.all([
        User.countDocuments({ role: USER_ROLES.USER, createdAt: { $gte: since } }),
        Product.countDocuments({ createdAt: { $gte: since } }),
        Order.countDocuments({ createdAt: { $gte: since } }),
        Order.aggregate([
            { $match: { paymentStatus: 'paid', paidAt: { $gte: since }, currency: 'NGN' } },
            { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
    ]);

    return {
        range,
        totalRevenue: (revenue[0]?.amount || 0) / 100,
        totalProducts,
        totalOrders,
        totalCustomers,
        currency: 'NGN',
    };
};

module.exports = { getDashboard };
