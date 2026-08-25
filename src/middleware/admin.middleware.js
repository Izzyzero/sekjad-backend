const { USER_ROLES } = require('../models/User');

const requireAdmin = (req, _res, next) => {
    if (!req.user) {
        const error = new Error('Authentication required');
        error.statusCode = 401;
        return next(error);
    }

    if (req.user.role !== USER_ROLES.ADMIN) {
        const error = new Error('Admin access required');
        error.statusCode = 403;
        return next(error);
    }

    return next();
};

module.exports = requireAdmin;
