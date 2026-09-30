const User = require('../models/User');
const { USER_ROLES } = require('../models/User');

const updateUserRole = async (req, res, next) => {
    try {
        if (req.user._id.equals(req.params.id) && req.body.role !== USER_ROLES.ADMIN) {
            const error = new Error('You cannot remove your own admin role');
            error.statusCode = 400;
            throw error;
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role: req.body.role },
            { returnDocument: 'after', runValidators: true }
        );

        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: 'User role updated successfully',
            data: user,
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { updateUserRole };
