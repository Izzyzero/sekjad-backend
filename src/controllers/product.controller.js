const productService = require('../services/product.service');

const handleProductError = (error) => {
    if (error?.code === 11000) {
        error.statusCode = 409;
        const field = Object.keys(error.keyPattern || {})[0];
        error.message = field ? `A product with that ${field} already exists` : 'Product already exists';
    }
    return error;
};

const createProduct = async (req, res, next) => {
    try {
        const product = await productService.createProduct(req.body, req.user._id);

        return res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product,
        });
    } catch (error) {
        return next(handleProductError(error));
    }
};

const getAllProducts = async (req, res, next) => {
    try {
        const result = await productService.getAllProducts(req.query);

        return res.status(200).json({
            success: true,
            message: 'Products retrieved successfully',
            data: result.products,
            pagination: result.pagination,
        });
    } catch (error) {
        return next(error);
    }
};

const getProductById = async (req, res, next) => {
    try {
        const product = await productService.getProductById(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'Product retrieved successfully',
            data: product,
        });
    } catch (error) {
        return next(error);
    }
};

const updateProduct = async (req, res, next) => {
    try {
        const product = await productService.updateProduct(
            req.params.id,
            req.body,
            req.files?.image?.[0]?.buffer,
            (req.files?.gallery || []).map((file) => file.buffer)
        );

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: product,
        });
    } catch (error) {
        return next(handleProductError(error));
    }
};

const deleteProduct = async (req, res, next) => {
    try {
        await productService.deleteProduct(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully',
        });
    } catch (error) {
        return next(error);
    }
};

const createPreviewHandler = (query) => async (_req, res, next) => {
    try {
        // Do not accept client filters/pagination that could expose the full catalog.
        const { products } = await productService.getAllProducts(query);
        const data = products.map(({ _id, title, slug, price, compareAtPrice, currency, image, isFeatured, tags }) => ({
            _id, title, slug, price, compareAtPrice, currency,
            image: image ? { url: image.url, altText: image.altText } : undefined,
            isFeatured,
            tags: tags ?? [],
        }));
        return res.status(200).json({ success: true, message: 'Product preview retrieved successfully', data });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getFeaturedPreview: createPreviewHandler({ page: '1', limit: '6', isFeatured: 'true', sort: 'newest' }),
    getLatestPreview: createPreviewHandler({ page: '1', limit: '6', sort: 'newest' }),
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
};
