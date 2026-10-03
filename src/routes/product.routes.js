const express = require('express');
const productController = require('../controllers/product.controller');
const authenticate = require('../middleware/auth.middleware');
const requireAdmin = require('../middleware/admin.middleware');
const { protectUpload } = require('../middleware/uploadLimits.middleware');
const { upload } = require('../utils/cloudinaryUpload');
const { handleUploadError } = require('../middleware/upload.middleware');
const parseProductMultipart = require('../middleware/productMultipart.middleware');
const {
    validateCreateProduct,
    validateUpdateProduct,
    validateProductId,
} = require('../validations/product.validation');

const router = express.Router();

// Only the bounded landing-page previews are public.
router.get('/preview/featured', productController.getFeaturedPreview);
router.get('/preview/latest', productController.getLatestPreview);
router.get('/', authenticate, productController.getAllProducts);
router.get('/:id', authenticate, validateProductId, productController.getProductById);

router.post(
    '/',
    authenticate,
    requireAdmin,
    protectUpload,
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 10 },
    ]),
    handleUploadError,
    parseProductMultipart,
    validateCreateProduct,
    productController.createProduct
);
router.patch(
    '/:id',
    authenticate,
    requireAdmin,
    validateProductId,
    protectUpload,
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 10 },
    ]),
    handleUploadError,
    parseProductMultipart,
    validateUpdateProduct,
    productController.updateProduct
);
router.delete('/:id', authenticate, requireAdmin, validateProductId, productController.deleteProduct);

module.exports = router;
