const express = require('express');
const categoryController = require('../controllers/category.controller');
const authenticate = require('../middleware/auth.middleware');
const requireAdmin = require('../middleware/admin.middleware');
const {
    validateCreateCategory,
    validateUpdateCategory,
    validateCategoryId,
} = require('../validations/category.validation');

const router = express.Router();

// Anyone can view active categories.
router.get('/', authenticate, categoryController.getAllCategories);
router.get('/:id', authenticate, validateCategoryId, categoryController.getCategoryById);

// Authentication runs first, then the user's database role is checked.
router.post('/', authenticate, requireAdmin, validateCreateCategory, categoryController.createCategory);
router.patch('/:id', authenticate, requireAdmin, validateCategoryId, validateUpdateCategory, categoryController.updateCategory);
router.delete('/:id', authenticate, requireAdmin, validateCategoryId, categoryController.deleteCategory);

module.exports = router;
