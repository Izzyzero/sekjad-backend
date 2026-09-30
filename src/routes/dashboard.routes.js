const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const requireAdmin = require('../middleware/admin.middleware');
const dashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/', authenticate, requireAdmin, dashboardController.getDashboard);

module.exports = router;
