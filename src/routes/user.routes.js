const express = require('express');
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/auth.middleware');
const requireAdmin = require('../middleware/admin.middleware');
const { validateUpdateUserRole } = require('../validations/user.validation');

const router = express.Router();

router.patch(
    '/:id/role',
    authenticate,
    requireAdmin,
    validateUpdateUserRole,
    userController.updateUserRole
);

module.exports = router;
