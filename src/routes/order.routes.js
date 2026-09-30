const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/order.controller');
const { header } = require('express-validator');
const handleValidation = require('../middleware/validation.middleware');
const { createRateLimiter } = require('../middleware/rateLimiter.middleware');

const router = express.Router();
router.use(authenticate);
router.post('/whatsapp', createRateLimiter({
    windowMs: 15 * 60 * 1000, limit: 10,
    message: 'Too many checkout attempts. Please try again in 15 minutes.',
}), header('Idempotency-Key').isUUID().withMessage('Idempotency-Key must be a UUID'),
handleValidation, controller.createWhatsAppOrder);
router.get('/', controller.listOrders);
router.get('/:id', controller.getOrder);

module.exports = router;
