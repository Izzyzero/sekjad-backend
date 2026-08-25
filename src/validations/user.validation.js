const { body, param } = require('express-validator');
const { USER_ROLES } = require('../models/User');
const handleValidation = require('../middleware/validation.middleware');

const validateUpdateUserRole = [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('role')
        .exists({ values: 'falsy' })
        .withMessage('Role is required')
        .isIn(Object.values(USER_ROLES))
        .withMessage('Role must be user or admin'),
    handleValidation,
];

module.exports = { validateUpdateUserRole };
