const express = require('express');
const authenticate = require('../middleware/auth.middleware');
const controller = require('../controllers/payment.controller');

const router = express.Router();
router.post('/initialize', authenticate, controller.initialize);
router.get('/verify/:reference', authenticate, controller.verify);

module.exports = router;
