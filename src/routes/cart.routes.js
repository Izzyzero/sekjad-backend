const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const cartController = require('../controllers/cart.controller');
const {
    validateAddCartItem,
    validateUpdateCartItem,
    validateCartProductId,
} = require('../validations/cart.validation');

const router = express.Router();
router.use(authenticate);

router.get('/', cartController.getCart);
router.post('/items', validateAddCartItem, cartController.addItem);
router.patch('/items/:cartItemId', validateUpdateCartItem, cartController.updateItemQuantity);
router.delete('/items/:cartItemId', validateCartProductId, cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
