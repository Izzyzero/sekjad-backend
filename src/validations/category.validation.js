const { body, param } = require('express-validator');
const handleValidation = require('../middleware/validation.middleware');

const categoryFields = [
    body('name')
        .optional()
        .isString().withMessage('Category name must be a string')
        .trim()
        .isLength({ min: 2, max: 80 }).withMessage('Category name must be between 2 and 80 characters'),
];

const validateCreateCategory = [
    body('name').exists({ values: 'falsy' }).withMessage('Category name is required'),
    ...categoryFields,
    handleValidation,
];

const validateUpdateCategory = [
    body().custom((value) => {
        const allowed = ['name'];
        if (!value || !allowed.some((field) => value[field] !== undefined)) {
            throw new Error('Provide at least one category field to update');
        }
        return true;
    }),
    ...categoryFields,
    handleValidation,
];

const validateCategoryId = [
    param('id').isMongoId().withMessage('Invalid category ID'),
    handleValidation,
];

module.exports = {
    validateCreateCategory,
    validateUpdateCategory,
    validateCategoryId,
};
