/**
 * Upload Middleware
 * Additional validation and error handling for file uploads
 */

/**
 * Handle multer errors
 */
const handleUploadError = (error, req, res, next) => {
    // Preserve authentication/authorization and other upstream HTTP errors.
    if (error?.statusCode) return next(error);
    if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: 'File size exceeds 5MB limit',
            });
        }

        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files uploaded',
            });
        }

        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected file field',
            });
        }

        if (error.message === 'Invalid file type, only JPEG and PNG allowed!') {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message || 'File upload error',
        });
    }

    next();
};

/**
 * Validate file is present
 */
const validateFilePresence = (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file uploaded. Please provide an image file.',
        });
    }
    next();
};

/**
 * Sanitize file metadata
 */
const sanitizeFileMetadata = (req, res, next) => {
    if (req.file) {
        // Remove sensitive information
        req.file = {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            encoding: req.file.encoding,
            mimetype: req.file.mimetype,
            size: req.file.size,
            buffer: req.file.buffer,
        };
    }
    next();
};

module.exports = {
    handleUploadError,
    validateFilePresence,
    sanitizeFileMetadata,
};
