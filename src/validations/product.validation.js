const { body, param, validationResult } = require('express-validator');
const { PRODUCT_STATUS } = require('../models/Product');
const handleValidation = require('../middleware/validation.middleware');
const { MAX_PRODUCT_PRICE } = require('../utils/inputLimits');

const productFields = [
    body('title').optional().isString().withMessage('Title must be a string').trim()
        .isLength({ min: 2, max: 150 }).withMessage('Title must be between 2 and 150 characters'),
    body('description').optional().isString().withMessage('Description must be a string').trim()
        .isLength({ min: 1, max: 5000 }).withMessage('Description must be between 1 and 5000 characters'),
    body('price').optional().isFloat({ min: 0, max: MAX_PRODUCT_PRICE })
        .withMessage(`Price must be between 0 and ${MAX_PRODUCT_PRICE}`)
        .custom((value) => Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-7)
        .withMessage('Price must have at most two decimal places').toFloat(),
    body('compareAtPrice').optional({ nullable: true }).isFloat({ min: 0, max: MAX_PRODUCT_PRICE })
        .withMessage(`Compare-at price must be between 0 and ${MAX_PRODUCT_PRICE}`)
        .custom((value) => Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-7)
        .withMessage('Compare-at price must have at most two decimal places').toFloat()
        .custom((value, { req }) => {
            if (value != null && req.body.price !== undefined && value < Number(req.body.price)) {
                throw new Error('Compare-at price must be greater than or equal to price');
            }
            return true;
        }),
    body('currency').optional().isString().withMessage('Currency must be a string').trim()
        .matches(/^[A-Za-z]{3}$/).withMessage('Currency must be a 3-letter ISO code').toUpperCase(),
    body('categories').optional().isArray({ min: 1 }).withMessage('At least one category is required'),
    body('categories.*').isMongoId().withMessage('Every category must be a valid MongoDB ID'),
    body('image').optional().isObject().withMessage('Image must be an object'),
    body('image.url').optional().isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('Product image URL must be a valid HTTP or HTTPS URL'),
    body('image.publicId').optional({ nullable: true }).isString().withMessage('Image publicId must be a string').trim(),
    body('image.altText').optional().isString().withMessage('Image alt text must be a string').trim()
        .isLength({ max: 150 }).withMessage('Image alt text cannot exceed 150 characters'),
    body('gallery').optional().isArray({ max: 10 }).withMessage('Gallery must contain at most 10 images'),
    body('gallery.*.url').optional().isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('Every gallery image must have a valid HTTP or HTTPS URL'),
    body('gallery.*.publicId').optional({ nullable: true }).isString().withMessage('Gallery publicId must be a string').trim(),
    body('gallery.*.altText').optional().isString().withMessage('Gallery alt text must be a string').trim()
        .isLength({ max: 150 }).withMessage('Gallery alt text cannot exceed 150 characters'),
    body('variants').optional().customSanitizer((value) => {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch { return value; }
    }).isArray().withMessage('Variants must be an array'),
    body('variants').optional().custom((variants) => {
        if (!Array.isArray(variants)) return true;
        const ids = variants.map((variant) => variant?.variantId).filter(Boolean);
        if (new Set(ids).size !== ids.length) throw new Error('Variant IDs must be unique');
        return true;
    }),
    body('variants.*').isObject().withMessage('Every variant must be an object'),
    body('variants.*.variantId').optional().isMongoId().withMessage('Variant ID must be a valid MongoDB ID'),
    body('variants.*.colorName').exists({ values: 'falsy' }).withMessage('Variant color name is required')
        .isString().withMessage('Variant color name must be a string').trim()
        .isLength({ min: 1, max: 80 }).withMessage('Variant color name cannot exceed 80 characters'),
    body('variants.*.image').exists().withMessage('Variant image is required')
        .isObject().withMessage('Variant image must be an object'),
    body('variants.*.image.url').exists({ values: 'falsy' }).withMessage('Variant image URL is required')
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('Variant image URL must be a valid HTTP or HTTPS URL'),
    body('variants.*.image.publicId').optional({ nullable: true }).isString()
        .withMessage('Variant image publicId must be a string').trim(),
    body('variants.*.image.altText').optional().isString().withMessage('Variant image alt text must be a string')
        .trim().isLength({ max: 150 }).withMessage('Variant image alt text cannot exceed 150 characters'),
    body('variants.*.isAvailable').optional().isBoolean()
        .withMessage('Variant isAvailable must be true or false').toBoolean(),
    body('sku').optional().isString().withMessage('SKU must be a string').trim().notEmpty().withMessage('SKU cannot be empty').toUpperCase(),
    body('brand').optional().isString().withMessage('Brand must be a string').trim()
        .isLength({ max: 100 }).withMessage('Brand cannot exceed 100 characters'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('tags.*').optional().isString().withMessage('Every tag must be a string').trim().notEmpty().withMessage('Tags cannot be empty'),
    body('status').optional().isIn(Object.values(PRODUCT_STATUS)).withMessage('Status must be draft, active, or archived'),
    body('isFeatured').optional().isBoolean().withMessage('isFeatured must be true or false').toBoolean(),
];

const validateCreateProduct = [
    body('title').exists({ values: 'falsy' }).withMessage('Product title is required'),
    body('description').exists({ values: 'falsy' }).withMessage('Product description is required'),
    body('price').exists({ values: 'null' }).withMessage('Product price is required'),
    body('categories').exists().withMessage('Product categories are required'),
    body('image').custom((value, { req }) => {
        if (req.files?.image?.length) return true;
        if (!value) throw new Error('Product image is required');
        return true;
    }),
    body('image.url').custom((value, { req }) => {
        if (req.files?.image?.length) return true;
        if (!value) throw new Error('Product image URL is required');
        return true;
    }),
    ...productFields,
    handleValidation,
];

// Multipart product creation receives the image as req.file. Cloudinary adds
// image.url and image.publicId after validation, so those body fields must not
// be required on the upload route.
const validateCreateProductUpload = [
    body('title').exists({ values: 'falsy' }).withMessage('Product title is required'),
    body('description').exists({ values: 'falsy' }).withMessage('Product description is required'),
    body('price').exists({ values: 'null' }).withMessage('Product price is required'),
    body('categories').exists().withMessage('Product categories are required'),
    ...productFields,
    handleValidation,
];

const validateUpdateProduct = [
    body().custom((value, { req }) => {
        const allowed = ['title', 'description', 'price', 'compareAtPrice', 'currency', 'categories', 'image',
            'gallery', 'variants', 'sku', 'brand', 'tags', 'status', 'isFeatured', 'replaceGallery',
            'removeGalleryPublicIds'];
        const hasFiles = Boolean(req.files?.image?.length || req.files?.gallery?.length);
        if (!hasFiles && (!value || !allowed.some((field) => value[field] !== undefined))) {
            throw new Error('Provide at least one product field to update');
        }
        return true;
    }),
    body('replaceGallery').optional().isBoolean().withMessage('replaceGallery must be true or false').toBoolean(),
    body('removeGalleryPublicIds').optional().customSanitizer((value) => {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string') return value;
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        }
    }).isArray().withMessage('removeGalleryPublicIds must be an array'),
    body('removeGalleryPublicIds.*').isString().withMessage('Every gallery publicId must be a string').trim().notEmpty()
        .withMessage('Gallery publicIds cannot be empty'),
    ...productFields,
    handleValidation,
];

const validateProductId = [
    param('id').isMongoId().withMessage('Invalid product ID'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
            });
        }
        return next();
    },
];

module.exports = {
    validateCreateProduct,
    validateCreateProductUpload,
    validateUpdateProduct,
    validateProductId,
};
