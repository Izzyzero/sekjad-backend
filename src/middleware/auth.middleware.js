const User = require('../models/User');
const { verifyAccessToken } = require('../utils/generateToken');

const authenticate = async (req, res, next) => {
    try {
        const authorization = req.get('authorization');
        if (!authorization || !authorization.startsWith('Bearer ')) {
            const error = new Error('Authentication required');
            error.statusCode = 401;
            throw error;
        }

        const token = authorization.slice(7).trim();

        const payload = verifyAccessToken(token);
        const user = await User.findById(payload.sub);

        if (!user || !user.isActive) {
            const error = new Error('User account is unavailable');
            error.statusCode = 401;
            throw error;
        }

        req.user = user;
        req.auth = payload;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            error.statusCode = 401;
            error.message = 'Invalid or expired access token';
        }
        next(error);
    }
};

module.exports = authenticate;
