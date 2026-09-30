const { rateLimit } = require('express-rate-limit');

const createRateLimiter = ({ windowMs, limit, message, skipSuccessfulRequests = false }) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (_req, res) => res.status(429).json({
        success: false,
        message,
    }),
});

// Low limit because successful requests send an email and can consume email quota.
const emailLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    message: 'Too many email requests. Please try again in 15 minutes.',
});

// Protects OTP checking and password changes against repeated guessing.
const verificationLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: 'Too many verification attempts. Please try again in 15 minutes.',
});

// Only failed login attempts consume the quota.
const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    message: 'Too many failed login attempts. Please try again in 15 minutes.',
});

// Higher limit for normal token renewal and logout traffic.
const sessionLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    message: 'Too many session requests. Please try again later.',
});

const passwordChangeLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: 'Too many password change attempts. Please try again in 15 minutes.',
});

const profileUpdateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: 'Too many profile update attempts. Please try again in 15 minutes.',
});

module.exports = {
    createRateLimiter,
    emailLimiter,
    verificationLimiter,
    loginLimiter,
    sessionLimiter,
    passwordChangeLimiter,
    profileUpdateLimiter,
};
