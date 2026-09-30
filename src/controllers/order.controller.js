const orderService = require('../services/order.service');
const whatsappOrderService = require('../services/whatsappOrder.service');

const createWhatsAppOrder = async (req, res, next) => {
    try {
        const result = await whatsappOrderService.create(req.user, req.get('Idempotency-Key'));
        return res.status(result.created ? 201 : 200).json({
            success: true,
            message: 'Order prepared. Open WhatsApp and send the message to arrange payment',
            data: result.data,
        });
    } catch (error) { return next(error); }
};

const listOrders = async (req, res, next) => {
    try {
        const result = await orderService.listOrders(req.user._id, req.query);
        return res.json({ success: true, data: result.orders, pagination: result.pagination });
    } catch (error) { return next(error); }
};

const getOrder = async (req, res, next) => {
    try {
        const order = await orderService.getOrder(req.user._id, req.params.id);
        return res.json({ success: true, data: order });
    } catch (error) { return next(error); }
};

module.exports = { listOrders, getOrder, createWhatsAppOrder };
