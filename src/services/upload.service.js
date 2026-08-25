const cloudinary = require('../config/cloudinary');
const Product = require('../models/Product');

/**
 * Upload a product image to Cloudinary and create product
 * @param {Buffer} fileBuffer - The file buffer from multer
 * @param {Buffer[]} galleryBuffers - Buffers for related product images
 * @param {Object} productData - Product data including categories
 * @param {string} adminId - Admin/user ID who created the product
 * @returns {Object} Created product with image
 */
const uploadBuffer = (fileBuffer) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
        {
            folder: 'sekjad_products',
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        },
        (error, result) => {
            if (error) {
                const uploadError = new Error('Cloudinary upload failed');
                uploadError.statusCode = 502;
                uploadError.details = error;
                reject(uploadError);
                return;
            }
            resolve(result);
        }
    );

    stream.end(fileBuffer);
});

const uploadProductImage = async (fileBuffer, galleryBuffers = [], productData, adminId) => {
    const uploadResults = await Promise.allSettled([
        uploadBuffer(fileBuffer),
        ...galleryBuffers.map((buffer) => uploadBuffer(buffer)),
    ]);

    const successfulUploads = uploadResults
        .filter(({ status }) => status === 'fulfilled')
        .map(({ value }) => value);
    const failedUpload = uploadResults.find(({ status }) => status === 'rejected');

    if (failedUpload) {
        await Promise.allSettled(
            successfulUploads.map(({ public_id: publicId }) => deleteProductImage(publicId))
        );
        throw failedUpload.reason;
    }

    const [mainImage, ...galleryImages] = successfulUploads;

    try {
        const product = await Product.create({
            ...productData,
            image: {
                url: mainImage.secure_url,
                publicId: mainImage.public_id,
                altText: productData.title || '',
            },
            gallery: galleryImages.map((image, index) => ({
                url: image.secure_url,
                publicId: image.public_id,
                altText: `${productData.title || 'Product'} image ${index + 2}`,
            })),
            createdBy: adminId,
        });

        await product.populate('categories', 'name slug');
        return product;
    } catch (error) {
        // Do not leave Cloudinary assets behind when database creation fails.
        await Promise.allSettled(
            successfulUploads.map(({ public_id: publicId }) => deleteProductImage(publicId))
        );
        throw error;
    }
};

/**
 * Delete a product image from Cloudinary
 * @param {string} publicId - Cloudinary public ID of the image
 */
const deleteProductImage = async (publicId) => {
    if (!publicId) return;

    const result = await cloudinary.uploader.destroy(publicId);
    if (!['ok', 'not found'].includes(result.result)) {
        const error = new Error('Cloudinary image deletion failed');
        error.statusCode = 502;
        error.details = result;
        throw error;
    }
};

module.exports = {
    uploadBuffer,
    uploadProductImage,
    deleteProductImage,
};
