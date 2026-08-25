const { body, param } = require('express-validator');
const handleValidation = require('../middleware/validation.middleware');

const validateAddWishlistProduct = [
    body('productId').exists({ values: 'falsy' }).withMessage('Product ID is required')
        .isMongoId().withMessage('Invalid product ID'),
    handleValidation,
];

const validateWishlistProductId = [
    param('productId').isMongoId().withMessage('Invalid product ID'),
    handleValidation,
];

module.exports = { validateAddWishlistProduct, validateWishlistProductId };
