const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validation.middleware');
const { createRateLimiter } = require('../middleware/rateLimiter.middleware');
const sendEmail = require('../utils/sendEmail');
const env = require('../config/env');

const router = express.Router();
router.post('/', createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    message: 'Too many messages. Please try again in 15 minutes.',
}), [
    body('name').isString().bail().trim().isLength({ min: 1, max: 120 }),
    body('email').isString().bail().trim().isLength({ max: 254 }).isEmail(),
    body('subject').optional().isString().bail().trim().isLength({ min: 1, max: 200 }).not().matches(/[\r\n]/),
    body('phone').optional().isString().bail().trim().isLength({ max: 40 }),
    body('message').isString().bail().trim().isLength({ min: 1, max: 5000 }),
], validate, async (req, res) => {
    const { name, email, phone, subject, message } = req.body;
    if (!env.contactTo) return res.status(503).json({ success: false, message: 'Contact form is temporarily unavailable.' });
    try {
        await sendEmail({
            to: env.contactTo,
            replyTo: email,
            subject: `Contact form: ${subject || 'Website enquiry'}`,
            text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\n\n${message}`,
        });
        return res.status(200).json({ success: true, message: 'Your message has been sent.' });
    } catch {
        return res.status(503).json({ success: false, message: 'Unable to send your message. Please try again later.' });
    }
});
module.exports = router;
