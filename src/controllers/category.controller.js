const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');

const ensureValidId = (id) => {
    if (!mongoose.isObjectIdOrHexString(id)) {
        const error = new Error('Invalid category ID');
        error.statusCode = 400;
        throw error;
    }
};

const handleDuplicate = (error) => {
    if (error?.code === 11000) {
        error.statusCode = 409;
        error.message = 'A category with that name already exists';
    }
    return error;
};

const createCategory = async (req, res, next) => {
    try {
        const category = await Category.create({
            ...req.body,
            createdBy: req.user?._id || null,
        });

        return res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: category,
        });
    } catch (error) {
        return next(handleDuplicate(error));
    }
};

const getAllCategories = async (_req, res, next) => {
    try {
        const categories = await Category.find().sort({ name: 1 }).lean();

        return res.status(200).json({
            success: true,
            message: 'Categories retrieved successfully',
            data: categories,
        });
    } catch (error) {
        return next(error);
    }
};

const getCategoryById = async (req, res, next) => {
    try {
        ensureValidId(req.params.id);
        const category = await Category.findById(req.params.id).lean();

        if (!category) {
            const error = new Error('Category not found');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: 'Category retrieved successfully',
            data: category,
        });
    } catch (error) {
        return next(error);
    }
};

const updateCategory = async (req, res, next) => {
    try {
        ensureValidId(req.params.id);
        const category = await Category.findById(req.params.id);

        if (!category) {
            const error = new Error('Category not found');
            error.statusCode = 404;
            throw error;
        }

        const allowedFields = ['name'];
        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) category[field] = req.body[field];
        });
        await category.save();

        return res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            data: category,
        });
    } catch (error) {
        return next(handleDuplicate(error));
    }
};

const deleteCategory = async (req, res, next) => {
    try {
        ensureValidId(req.params.id);

        const isInUse = await Product.exists({ categories: req.params.id });
        if (isInUse) {
            const error = new Error('Cannot delete a category that is assigned to products');
            error.statusCode = 409;
            throw error;
        }

        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) {
            const error = new Error('Category not found');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: 'Category deleted successfully',
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
};
