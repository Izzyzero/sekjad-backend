const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/payment.controller');
const { createRateLimiter } = require('../middleware/rateLimiter.middleware');

const router = express.Router();
router.use(authenticate, createRateLimiter({
    windowMs: 15 * 60 * 1000, limit: 30,
    message: 'Too many payment requests. Please try again later.',
}));
router.post('/initialize', controller.initialize);
router.get('/verify/:reference', controller.verify);

module.exports = router;
