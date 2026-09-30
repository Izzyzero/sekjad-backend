const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const requireAdmin = require('../middleware/admin.middleware');
const controller = require('../controllers/adminOrder.controller');

const router = express.Router();
router.get('/', authenticate, requireAdmin, controller.listAdminOrders);
router.get('/:id', authenticate, requireAdmin, controller.getAdminOrder);
router.patch('/:id/whatsapp-confirm', authenticate, requireAdmin, controller.confirmWhatsAppPayment);

module.exports = router;
