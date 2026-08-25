const { body, param } = require('express-validator');
const handleValidation = require('../middleware/validation.middleware');

const validateAddCartItem = [
    body('productId').exists({ values: 'falsy' }).withMessage('Product ID is required')
        .isMongoId().withMessage('Invalid product ID'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be a whole number of at least 1').toInt(),
    (req, _res, next) => {
        if (req.body.quantity === undefined) req.body.quantity = 1;
        next();
    },
    handleValidation,
];

const validateUpdateCartItem = [
    param('productId').isMongoId().withMessage('Invalid product ID'),
    body('quantity').exists({ values: 'null' }).withMessage('Quantity is required')
        .isInt({ min: 1 }).withMessage('Quantity must be a whole number of at least 1').toInt(),
    handleValidation,
];

const validateCartProductId = [
    param('productId').isMongoId().withMessage('Invalid product ID'),
    handleValidation,
];

module.exports = { validateAddCartItem, validateUpdateCartItem, validateCartProductId };
