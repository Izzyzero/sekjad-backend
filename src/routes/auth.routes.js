const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth.middleware');
const {
    emailLimiter,
    verificationLimiter,
    loginLimiter,
    sessionLimiter,
    passwordChangeLimiter,
    profileUpdateLimiter,
} = require('../middleware/rateLimiter.middleware');
const {
    validateRegistration,
    validateEmailCode,
    validateForgotPassword,
    validateResetPassword,
    validateLogin,
    validateGoogleSignIn,
} = require('../validations/auth.validation');

const router = express.Router();
const { validateProfileUpdate, validatePasswordChange, validateEmailChange } = require('../validations/profile.validation');

router.post('/register', validateRegistration, emailLimiter, authController.register);
router.post('/verify-email', validateEmailCode, verificationLimiter, authController.verifyEmail);
router.post('/forgot-password', validateForgotPassword, emailLimiter, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, verificationLimiter, authController.resetPassword);
router.post('/login', validateLogin, loginLimiter, authController.login);
router.post('/google', loginLimiter, validateGoogleSignIn, authController.googleSignIn);
router.post('/refresh', sessionLimiter, authController.refresh);
router.post('/logout', sessionLimiter, authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, profileUpdateLimiter, validateProfileUpdate, authController.updateMe);
router.post('/me/verify-email', authenticate, verificationLimiter, validateEmailChange, authController.verifyProfileEmail);
router.post('/change-password', authenticate, passwordChangeLimiter, validatePasswordChange, authController.changePassword);

module.exports = router;
