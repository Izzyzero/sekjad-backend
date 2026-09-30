const express = require('express');
const { upload } = require('../utils/cloudinaryUpload');
const uploadController = require('../controllers/upload.controller');
const authenticate = require('../middleware/auth.middleware');
const requireAdmin = require('../middleware/admin.middleware');
const { protectUpload } = require('../middleware/uploadLimits.middleware');
const { handleUploadError } = require('../middleware/upload.middleware');
const {
    validateCreateProductUpload,
} = require('../validations/product.validation');

const router = express.Router();

/**
 * POST /api/upload/product
 * Upload a product with image
 * Access: Private (Admin only)
 * Body: multipart/form-data with file and product data
 */
router.post(
    '/product',
    authenticate,
    requireAdmin,
    protectUpload,
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 10 },
    ]),
    handleUploadError,
    validateCreateProductUpload,
    uploadController.uploadProductWithImage
);

/**
 * POST /api/upload/image
 * Upload a standalone image
 * Access: Private (Admin only)
 * Body: multipart/form-data with file
 */
router.post(
    '/image',
    authenticate,
    requireAdmin,
    protectUpload,
    upload.single('image'),
    handleUploadError,
    uploadController.uploadImage
);

module.exports = router;
