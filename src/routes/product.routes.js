const express = require('express');
const productController = require('../controllers/product.controller');
const authenticate = require('../middleware/auth.middleware');
const requireAdmin = require('../middleware/admin.middleware');
const { upload } = require('../utils/cloudinaryUpload');
const { handleUploadError } = require('../middleware/upload.middleware');
const {
    validateCreateProduct,
    validateUpdateProduct,
    validateProductId,
} = require('../validations/product.validation');

const router = express.Router();

router.get('/', authenticate, productController.getAllProducts);
router.get('/:id', authenticate, validateProductId, productController.getProductById);

router.post('/', authenticate, requireAdmin, validateCreateProduct, productController.createProduct);
router.patch(
    '/:id',
    authenticate,
    requireAdmin,
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 10 },
    ]),
    handleUploadError,
    validateProductId,
    validateUpdateProduct,
    productController.updateProduct
);
router.delete('/:id', authenticate, requireAdmin, validateProductId, productController.deleteProduct);

module.exports = router;
