const { body } = require('express-validator');
const handleValidation = require('../middleware/validation.middleware');
const strongPassword = require('./password.validation');

const text = (field) => body(field).optional().isString().withMessage(`${field} must be a string`).bail().trim();
const password = (field) => body(field).isString().withMessage(`${field} must be a string`).bail()
    .notEmpty().withMessage(`${field} is required`);

const validateProfileUpdate = [
    (req, res, next) => {
        if (!req.body || !['firstName', 'lastName', 'email', 'phone', 'phoneNumber']
            .some((field) => Object.hasOwn(req.body, field))) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: [{ field: 'body', message: 'Provide at least one personal information field' }],
            });
        }
        next();
    },
    text('firstName').notEmpty().withMessage('First name is required')
        .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
    text('lastName').notEmpty().withMessage('Last name is required')
        .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
    text('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    ...['phone', 'phoneNumber'].map((field) => text(field)
        .matches(/^\+?[1-9]\d{7,14}$/).withMessage('Please provide a valid phone number')),
    body('phone').custom((value, { req }) => value === undefined || req.body.phoneNumber === undefined
        || value === req.body.phoneNumber).withMessage('phone and phoneNumber must match'),
    body('currentPassword').optional().isString().withMessage('Current password must be a string').bail()
        .notEmpty().withMessage('Current password is required'),
    handleValidation,
];

const validatePasswordChange = [
    password('currentPassword'),
    strongPassword('newPassword'),
    password('confirmPassword').custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
    handleValidation,
];

const validateEmailChange = [
    body('email').isString().withMessage('Email must be a string').bail().trim()
        .isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('code').isString().withMessage('Code must be a string').bail().trim()
        .matches(/^\d{6}$/).withMessage('Code must be 6 digits'),
    handleValidation,
];

module.exports = { validateProfileUpdate, validatePasswordChange, validateEmailChange };
