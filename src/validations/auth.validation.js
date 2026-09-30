const { body, validationResult } = require('express-validator');
const strongPassword = require('./password.validation');

const validateRegistration = [
    body('phoneNumber')
        .trim()
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+?[1-9]\d{7,14}$/)
        .withMessage('Please provide a valid phone number'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('firstName')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ max: 50 })
        .withMessage('First name cannot exceed 50 characters'),

    body('lastName')
        .trim()
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ max: 50 })
        .withMessage('Last name cannot exceed 50 characters'),

    strongPassword(),

    body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
        .custom((value, { req }) => {
            const password = req.body.password;

            if (typeof password !== 'string' || password.length < 8) {
                return true;
            }

            return value === password;
        })
        .withMessage('Passwords do not match'),

    (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
            });
        }

        req.body = {
            phoneNumber: String(req.body.phoneNumber).trim(),
            email: String(req.body.email).trim().toLowerCase(),
            firstName: String(req.body.firstName).trim(),
            lastName: String(req.body.lastName).trim(),
            password: req.body.password,
            confirmPassword: req.body.confirmPassword,
        };

        next();
    },
];
const validateLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('password')
        .isString()
        .withMessage('Password must be a string')
        .notEmpty()
        .withMessage('Password is required'),

    (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
            });
        }

        req.body = {
            email: String(req.body.email).trim().toLowerCase(),
            password: req.body.password,
        };

        next();
    },
];

const sendValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
        });
    }
    req.body.email = String(req.body.email).trim().toLowerCase();
    next();
};

const emailRule = () => body('email').trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email').normalizeEmail();
const codeRule = () => body('code').trim().matches(/^\d{6}$/).withMessage('Code must be 6 digits');

const validateEmailCode = [emailRule(), codeRule(), sendValidationErrors];
const validateForgotPassword = [emailRule(), sendValidationErrors];
const validateResetPassword = [
    emailRule(),
    codeRule(),
    strongPassword(),
    body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
    sendValidationErrors,
];

module.exports = {
    validateGoogleSignIn: (req, res, next) => {
        const credential = req.body?.credential;
        if (typeof credential !== 'string' || !credential.trim() || credential.length > 16384) {
            return res.status(400).json({ success: false, message: 'A valid Google credential is required' });
        }
        req.body = { credential };
        next();
    },
    validateRegistration,
    validateEmailCode,
    validateForgotPassword,
    validateResetPassword,
    validateLogin,
};
