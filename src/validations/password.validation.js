const { body } = require('express-validator');

// Do not trim passwords: spaces are part of the user's chosen credential.
const strongPassword = (field = 'password') => body(field)
    .isString().withMessage('Password must be a string').bail()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters').bail()
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[^\p{L}\p{N}\s]/u).withMessage('Password must contain at least one special character');

module.exports = strongPassword;
