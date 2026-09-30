const uploadService = require('../services/upload.service');

/**
 * Upload product with image
 * POST /api/upload/product
 */
const uploadProductWithImage = async (req, res, next) => {
    try {
        // Validate file exists
        const mainImage = req.files?.image?.[0];
        const galleryImages = req.files?.gallery || [];

        if (!mainImage) {
            const error = new Error('No main image uploaded. Use the image field.');
            error.statusCode = 400;
            throw error;
        }

        // Upload the main image and related gallery images, then create product.
        const product = await uploadService.uploadProductImage(
            mainImage.buffer,
            galleryImages.map((file) => file.buffer),
            req.body,
            req.user._id
        );

        return res.status(201).json({
            success: true,
            message: 'Product created with images successfully',
            data: product,
        });
    } catch (error) {
        return next(error);
    }
};

/**
 * Upload just an image (without creating product)
 * POST /api/upload/image
 */
const uploadImage = async (req, res, next) => {
    try {
        if (!req.file) {
            const error = new Error('No file uploaded');
            error.statusCode = 400;
            throw error;
        }

        return new Promise((resolve) => {
            const cloudinary = require('../config/cloudinary');
            
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: 'sekjad_uploads',
                    resource_type: 'image',
                    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                },
                (error, result) => {
                    if (error) {
                        res.status(500).json({
                            success: false,
                            message: 'Image upload failed',
                        });
                        resolve();
                        return;
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Image uploaded successfully',
                        data: {
                            url: result.secure_url,
                            publicId: result.public_id,
                            width: result.width,
                            height: result.height,
                            format: result.format,
                        },
                    });
                    resolve();
                }
            );

            stream.end(req.file.buffer);
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    uploadProductWithImage,
    uploadImage,
};
