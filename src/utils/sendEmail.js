const transporter = require('../config/mail');
const env = require('../config/env');

const sendEmail = async ({ to, subject, text, html, replyTo }) => {
    if (!env.resendApiKey || !env.mailFrom) {
        const error = new Error('Email service is not configured');
        error.statusCode = 503;
        throw error;
    }

    try {
        return await transporter.sendMail({ from: env.mailFrom, to, subject, text, html, replyTo });
    } catch (cause) {
        // Never expose provider responses, credentials, or message contents.
        console.error('Email delivery failed', {
            provider: 'resend',
            status: Number.isInteger(cause.status) ? cause.status : undefined,
        });
        const error = new Error('Unable to send verification email. Please try again later');
        error.statusCode = 503;
        throw error;
    }
};

module.exports = sendEmail;
