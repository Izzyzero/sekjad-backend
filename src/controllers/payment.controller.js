const paymentService = require('../services/payment.service');

const initialize = async (req, res, next) => {
    try {
        const data = await paymentService.initialize(req.user);
        res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
};

const verify = async (req, res, next) => {
    try {
        const data = await paymentService.verify(req.params.reference, req.user);
        res.json({ success: true, data });
    } catch (error) { next(error); }
};

const webhook = async (req, res, next) => {
    try {
        await paymentService.webhook(req.body, req.get('x-paystack-signature'));
        res.sendStatus(200);
    } catch (error) { next(error); }
};

module.exports = { initialize, verify, webhook };
