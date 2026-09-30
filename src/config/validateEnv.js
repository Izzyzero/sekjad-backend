const jwt = require('jsonwebtoken');

// Validate only at startup, so importing modules does not start or configure a server.
module.exports = function validateEnv(env = process.env) {
    const errors = [];
    try { require('./proxy').getTrustProxy(env); } catch (error) { errors.push(error.message); }
    const required = (key, value = env[key]) => {
        if (typeof value !== 'string' || !value.trim()) errors.push(`${key} is required`);
    };
    for (const key of ['MONGO_URI', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'SALT',
        'BASE_URL', 'CLOUD_NAME', 'CLOUD_API_KEY', 'CLOUD_API_SECRET', 'RESEND_API_KEY', 'MAIL_FROM']) required(key);
    if (env.MAIL_FROM && !require('validator').isEmail(env.MAIL_FROM, { allow_display_name: true })) errors.push('MAIL_FROM must be an email address, optionally with a display name');
    if (env.MONGO_URI && !/^mongodb(?:\+srv)?:\/\/\S+$/.test(env.MONGO_URI)) errors.push('MONGO_URI must be a MongoDB connection URI');
    const integer = (key, fallback, min, max) => {
        const value = env[key] ?? String(fallback);
        if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) errors.push(`${key} must be an integer from ${min} to ${max}`);
    };
    integer('PORT', 10000, 1, 65535);
    integer('SALT', 10, 4, 15);
    integer('OTP_EXPIRES_MINUTES', 10, 1, 60);
    integer('OTP_MAX_ATTEMPTS', 5, 1, 20);
    for (const key of ['BASE_URL', 'FRONTEND_ORIGIN', 'PAYSTACK_CALLBACK_URL']) {
        if (!env[key]) continue;
        try {
            const url = new URL(env[key]);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
                || (env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error();
        } catch { errors.push(`${key} must be a valid HTTP(S) URL (HTTPS in production)`); }
    }
    for (const key of ['ACCESS_TOKEN_EXPIRES_IN', 'REFRESH_TOKEN_EXPIRES_IN']) {
        if (env[key] === undefined) continue;
        try {
            const token = jwt.sign({}, 'configuration-validation-only', { expiresIn: env[key] });
            const payload = jwt.decode(token);
            if (payload.exp <= payload.iat) throw new Error();
        } catch { errors.push(`${key} must be a positive JWT duration, for example 15m or 7d`); }
    }
    if (env.ACCESS_TOKEN_SECRET && env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET) errors.push('JWT secrets must be different');
    if (env.NODE_ENV === 'production') {
        for (const key of ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET']) {
            if (env[key] && env[key].length < 32) errors.push(`${key} must contain at least 32 characters in production`);
        }
    }
    if (env.PAYSTACK_ENABLED !== undefined && !['true', 'false'].includes(env.PAYSTACK_ENABLED)) errors.push('PAYSTACK_ENABLED must be true or false');
    if (env.PAYSTACK_ENABLED === 'true') required('PAYSTACK_SECRET_KEY');
    else required('WHATSAPP_ORDER_NUMBER');
    if (env.WHATSAPP_ORDER_NUMBER && !/^\+?[1-9]\d{7,14}$/.test(env.WHATSAPP_ORDER_NUMBER)) errors.push('WHATSAPP_ORDER_NUMBER must be an international phone number');
    if (env.GOOGLE_CLIENT_ID && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID)) errors.push('GOOGLE_CLIENT_ID must be a Google OAuth client ID');
    if (errors.length) {
        const error = new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
        error.code = 'INVALID_CONFIG';
        throw error;
    }
};
