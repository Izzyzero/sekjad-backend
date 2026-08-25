const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const wishlistController = require('../controllers/wishlist.controller');
const {
    validateAddWishlistProduct,
    validateWishlistProductId,
} = require('../validations/wishlist.validation');

const router = express.Router();
router.use(authenticate);

router.get('/', wishlistController.getWishlist);
router.post('/items', validateAddWishlistProduct, wishlistController.addProduct);
router.delete('/items/:productId', validateWishlistProductId, wishlistController.removeProduct);
router.delete('/', wishlistController.clearWishlist);

module.exports = router;
