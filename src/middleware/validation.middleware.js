const { matchedData, validationResult } = require('express-validator');

const handleValidation = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
        });
    }

    // Only validated body fields reach create/update controllers.
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        req.body = matchedData(req, { locations: ['body'] });
    }

    return next();
};

module.exports = handleValidation;
