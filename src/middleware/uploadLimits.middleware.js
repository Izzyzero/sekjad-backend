const { rateLimit } = require('express-rate-limit');

// These middleware run only after authentication and the database admin check.
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
        success: false, message: 'Too many uploads. Please try again in 15 minutes.',
    }),
});

// Shared by all upload routes in this process. Reject rather than queue buffers.
let activeUploads = 0;
const uploadConcurrency = (_req, res, next) => {
    if (activeUploads >= 2) {
        res.set('Retry-After', '5');
        return res.status(503).json({ success: false, message: 'Uploads are busy. Please try again shortly.' });
    }
    activeUploads += 1;
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        activeUploads -= 1;
    };
    res.once('finish', release);
    res.once('close', release);
    next();
};

const protectUpload = (req, res, next) => {
    // Ordinary JSON product edits do not consume the upload allowance.
    if (!req.is('multipart/form-data')) return next();
    return uploadLimiter(req, res, () => uploadConcurrency(req, res, next));
};

module.exports = { protectUpload };
