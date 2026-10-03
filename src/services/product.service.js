const mongoose = require('mongoose');
const Product = require('../models/Product');
const { PRODUCT_STATUS } = require('../models/Product');
const Category = require('../models/Category');
const Wishlist = require('../models/Wishlist');
const Cart = require('../models/Cart');
const { uploadBuffer, deleteProductImage } = require('./upload.service');

const SORT_OPTIONS = Object.freeze({
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
});

const toPositiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

const ensureValidProductId = (id) => {
    if (!mongoose.isObjectIdOrHexString(id)) {
        const error = new Error('Invalid product ID');
        error.statusCode = 400;
        throw error;
    }
};

const normalizeVariants = (variants, currentVariants = []) => {
    if (!Array.isArray(variants)) {
        const error = new Error('Variants must be an array');
        error.statusCode = 400;
        throw error;
    }
    const currentIds = new Set(currentVariants.map((variant) => String(variant.variantId)));
    const seenIds = new Set();
    return variants.map((variant) => {
        if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
            const error = new Error('Every variant must be an object');
            error.statusCode = 400;
            throw error;
        }
        let variantId = variant.variantId;
        if (variantId !== undefined) {
            if (!mongoose.isObjectIdOrHexString(variantId)) {
                const error = new Error('Invalid variant ID');
                error.statusCode = 400;
                throw error;
            }
            variantId = String(variantId);
            if (!currentIds.has(variantId)) {
                const error = new Error('Variant ID does not belong to this product');
                error.statusCode = 400;
                throw error;
            }
            if (seenIds.has(variantId)) {
                const error = new Error('Variant IDs must be unique');
                error.statusCode = 400;
                throw error;
            }
            seenIds.add(variantId);
        } else {
            variantId = new mongoose.Types.ObjectId();
        }
        return { ...variant, variantId };
    });
};

const validateCategories = async (categories) => {
    if (!Array.isArray(categories) || categories.length === 0) {
        const error = new Error('At least one category is required');
        error.statusCode = 400;
        throw error;
    }

    const categoryIds = [...new Set(categories.map(String))];
    if (!categoryIds.every((id) => mongoose.isObjectIdOrHexString(id))) {
        const error = new Error('One or more category IDs are invalid');
        error.statusCode = 400;
        throw error;
    }

    const categoryCount = await Category.countDocuments({
        _id: { $in: categoryIds },
    });
    if (categoryCount !== categoryIds.length) {
        const error = new Error('One or more categories do not exist');
        error.statusCode = 400;
        throw error;
    }

    return categoryIds;
};

const createProduct = async (productData, adminId, imageBuffer, galleryBuffers = []) => {
    const { stock, ...details } = productData;
    const categories = await validateCategories(productData.categories);
    if (details.variants !== undefined) details.variants = normalizeVariants(details.variants);
    let uploadedImages = [];

    if (imageBuffer || galleryBuffers.length) {
        const uploadResults = await Promise.allSettled([
            ...(imageBuffer ? [uploadBuffer(imageBuffer)] : []),
            ...galleryBuffers.map((buffer) => uploadBuffer(buffer)),
        ]);
        uploadedImages = uploadResults
            .filter(({ status }) => status === 'fulfilled')
            .map(({ value }) => value);
        const failedUpload = uploadResults.find(({ status }) => status === 'rejected');

        if (failedUpload) {
            await Promise.allSettled(
                uploadedImages.map(({ public_id: publicId }) => deleteProductImage(publicId))
            );
            throw failedUpload.reason;
        }

        let uploadedGallery;
        if (imageBuffer) {
            const [mainImage, ...galleryImages] = uploadedImages;
            details.image = {
                url: mainImage.secure_url,
                publicId: mainImage.public_id,
                altText: details.image?.altText ?? details.title,
            };
            uploadedGallery = galleryImages;
        } else {
            uploadedGallery = uploadedImages;
        }
        if (uploadedGallery.length) {
            details.gallery = uploadedGallery.map((image, index) => ({
                url: image.secure_url,
                publicId: image.public_id,
                altText: `${details.title || 'Product'} image ${index + 1}`,
            }));
        }
    }

    let product;
    try {
        product = await Product.create({
            ...details,
            categories,
            createdBy: adminId,
        });
    } catch (error) {
        await Promise.allSettled(
            uploadedImages.map(({ public_id: publicId }) => deleteProductImage(publicId))
        );
        throw error;
    }
    return product.populate('categories', 'name slug');
};

const getProductById = async (productId) => {
    ensureValidProductId(productId);
    const product = await Product.findOne({
        _id: productId,
        status: PRODUCT_STATUS.ACTIVE,
    })
        .populate('categories', 'name slug')
        .lean({ virtuals: true });

    if (!product) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
    }

    return { ...product, inStock: true };
};

const updateProduct = async (productId, changes, imageBuffer, galleryBuffers = []) => {
    ensureValidProductId(productId);
    const product = await Product.findById(productId);

    if (!product) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
    }

    const allowedFields = [
        'title',
        'description',
        'price',
        'compareAtPrice',
        'currency',
        'categories',
        'image',
        'gallery',
        'variants',
        'sku',
        'brand',
        'tags',
        'status',
        'isFeatured',
    ];

    if (changes.categories !== undefined) {
        changes.categories = await validateCategories(changes.categories);
    }
    if (changes.variants !== undefined) {
        changes.variants = normalizeVariants(changes.variants, product.variants || []);
    }

    let uploadedImage;
    let uploadedGallery = [];
    const oldImagePublicId = product.image?.publicId;

    const galleryUploadResults = await Promise.allSettled(
        galleryBuffers.map((buffer) => uploadBuffer(buffer))
    );
    uploadedGallery = galleryUploadResults
        .filter(({ status }) => status === 'fulfilled')
        .map(({ value }) => value);
    const failedGalleryUpload = galleryUploadResults.find(({ status }) => status === 'rejected');

    if (failedGalleryUpload) {
        await Promise.allSettled(
            uploadedGallery.map(({ public_id: publicId }) => deleteProductImage(publicId))
        );
        throw failedGalleryUpload.reason;
    }

    if (imageBuffer) {
        try {
            uploadedImage = await uploadBuffer(imageBuffer);
        } catch (error) {
            await Promise.allSettled(
                uploadedGallery.map(({ public_id: publicId }) => deleteProductImage(publicId))
            );
            throw error;
        }
        changes.image = {
            url: uploadedImage.secure_url,
            publicId: uploadedImage.public_id,
            altText: changes.image?.altText ?? product.image?.altText ?? product.title,
        };
    }

    const originalGallery = [...(product.gallery || [])];
    const requestedRemovals = new Set(changes.removeGalleryPublicIds || []);
    const replaceGallery = changes.replaceGallery === true;
    const retainedGallery = replaceGallery
        ? []
        : originalGallery.filter((image) => !requestedRemovals.has(image.publicId));
    const newGalleryEntries = uploadedGallery.map((image, index) => ({
        url: image.secure_url,
        publicId: image.public_id,
        altText: `${changes.title || product.title || 'Product'} image ${retainedGallery.length + index + 1}`,
    }));

    if (replaceGallery || requestedRemovals.size || uploadedGallery.length) {
        changes.gallery = [...retainedGallery, ...newGalleryEntries];
    }

    delete changes.replaceGallery;
    delete changes.removeGalleryPublicIds;

    allowedFields.forEach((field) => {
        if (changes[field] !== undefined) product[field] = changes[field];
    });

    // Product slugs follow the title, so regenerate it after a title change.
    if (changes.title !== undefined) product.slug = undefined;

    try {
        await product.save();
    } catch (error) {
        // The database still points at the old image, so remove the unused upload.
        await Promise.allSettled([
            ...(uploadedImage?.public_id ? [deleteProductImage(uploadedImage.public_id)] : []),
            ...uploadedGallery.map(({ public_id: publicId }) => deleteProductImage(publicId)),
        ]);
        throw error;
    }

    // Delete only images replaced through this upload flow. JSON metadata updates
    // may point at assets that are managed outside this service.
    if (uploadedImage && oldImagePublicId && oldImagePublicId !== uploadedImage.public_id) {
        await deleteProductImage(oldImagePublicId);
    }

    const retainedPublicIds = new Set((changes.gallery || originalGallery).map((image) => image.publicId));
    const removedGalleryPublicIds = originalGallery
        .map((image) => image.publicId)
        .filter((publicId) => publicId && !retainedPublicIds.has(publicId));
    await Promise.all(removedGalleryPublicIds.map((publicId) => deleteProductImage(publicId)));

    return product.populate('categories', 'name slug');
};

const deleteProduct = async (productId) => {
    ensureValidProductId(productId);
    const product = await Product.findById(productId);

    if (!product) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
    }

    const publicIds = [
        product.image?.publicId,
        ...(product.gallery || []).map((image) => image.publicId),
        ...(product.variants || []).map((variant) => variant.image?.publicId),
    ].filter(Boolean);

    // Remove Cloudinary assets before deleting the database record so a
    // failed Cloudinary request does not silently leave orphaned images.
    await Promise.all(publicIds.map((publicId) => deleteProductImage(publicId)));
    await product.deleteOne();

    await Wishlist.updateMany({}, { $pull: { products: product._id } });
    await Cart.updateMany({}, { $pull: { items: { product: product._id } } });
    return product;
};

const getAllProducts = async (query = {}) => {
    const page = toPositiveInteger(query.page, 1);
    const limit = toPositiveInteger(query.limit, 12, 100);
    const filter = { status: PRODUCT_STATUS.ACTIVE };

    if (query.category) {
        if (!mongoose.isObjectIdOrHexString(query.category)) {
            const error = new Error('Invalid category ID');
            error.statusCode = 400;
            throw error;
        }
        filter.categories = query.category;
    }

    // Support the model field name for clients while retaining the original
    // `featured` query parameter for backward compatibility.
    const featuredQuery = query.isFeatured ?? query.featured;
    if (featuredQuery === 'true' || featuredQuery === 'false') {
        filter.isFeatured = featuredQuery === 'true';
    }

    const minPrice = query.minPrice === undefined ? undefined : Number(query.minPrice);
    const maxPrice = query.maxPrice === undefined ? undefined : Number(query.maxPrice);

    if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) {
        const error = new Error('Minimum price must be a non-negative number');
        error.statusCode = 400;
        throw error;
    }
    if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
        const error = new Error('Maximum price must be a non-negative number');
        error.statusCode = 400;
        throw error;
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        const error = new Error('Minimum price cannot be greater than maximum price');
        error.statusCode = 400;
        throw error;
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
        filter.price = {};
        if (minPrice !== undefined) filter.price.$gte = minPrice;
        if (maxPrice !== undefined) filter.price.$lte = maxPrice;
    }

    if (typeof query.search === 'string' && query.search.trim()) {
        filter.$text = { $search: query.search.trim() };
    }

    const sort = SORT_OPTIONS[query.sort] || SORT_OPTIONS.newest;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
        Product.find(filter).sort(sort).skip(skip).limit(limit).lean({ virtuals: true }),
        Product.countDocuments(filter),
    ]);

    return {
        products: products.map((product) => ({ ...product, inStock: true })),
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    };
};

module.exports = {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
};
