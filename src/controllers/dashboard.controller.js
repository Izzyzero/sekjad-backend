const dashboardService = require('../services/dashboard.service');

const getDashboard = async (req, res, next) => {
    try {
        const data = await dashboardService.getDashboard(req.query.range);
        return res.status(200).json({
            success: true,
            message: 'Dashboard retrieved successfully',
            data,
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getDashboard };
