const orderService = require('../services/order.service');

const listAdminOrders = async (req, res, next) => {
    try {
        const result = await orderService.listAdminOrders(req.query);
        return res.json({ success: true, ...result, data: result });
    } catch (error) {
        return next(error);
    }
};

const getAdminOrder = async (req, res, next) => {
    try {
        const order = await orderService.getAdminOrder(req.params.id);
        return res.json({ success: true, data: order });
    } catch (error) {
        return next(error);
    }
};

const confirmWhatsAppPayment = async (req, res, next) => {
    try {
        const order = await orderService.confirmWhatsAppPayment(req.params.id);
        return res.json({ success: true, message: 'WhatsApp order confirmed as paid', data: order });
    } catch (error) {
        return next(error);
    }
};

module.exports = { listAdminOrders, getAdminOrder, confirmWhatsAppPayment };
