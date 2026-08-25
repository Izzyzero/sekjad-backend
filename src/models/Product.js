const mongoose = require('mongoose');

const PRODUCT_STATUS = Object.freeze({
    DRAFT: 'draft',
    ACTIVE: 'active',
    ARCHIVED: 'archived',
});

const imageSchema = new mongoose.Schema(
    {
        url: {
            type: String,
            required: [true, 'Product image URL is required'],
            trim: true,
        },
        publicId: {
            type: String,
            trim: true,
            default: null,
        },
        altText: {
            type: String,
            trim: true,
            maxlength: [150, 'Image alt text cannot exceed 150 characters'],
            default: '',
        },
    },
    { _id: false }
);

const productSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Product title is required'],
            trim: true,
            minlength: [2, 'Product title must be at least 2 characters'],
            maxlength: [150, 'Product title cannot exceed 150 characters'],
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        description: {
            type: String,
            required: [true, 'Product description is required'],
            trim: true,
            maxlength: [5000, 'Product description cannot exceed 5000 characters'],
        },
        price: {
            type: Number,
            required: [true, 'Product price is required'],
            min: [0, 'Product price cannot be negative'],
        },
        compareAtPrice: {
            type: Number,
            min: [0, 'Compare-at price cannot be negative'],
            default: null,
            validate: {
                validator(value) {
                    return value == null || value >= this.price;
                },
                message: 'Compare-at price must be greater than or equal to price',
            },
        },
        currency: {
            type: String,
            trim: true,
            uppercase: true,
            minlength: [3, 'Currency must be a 3-letter ISO code'],
            maxlength: [3, 'Currency must be a 3-letter ISO code'],
            default: 'NGN',
        },
        categories: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Category',
            },
        ],
        image: {
            type: imageSchema,
            required: [true, 'Product image is required'],
        },
        gallery: {
            type: [imageSchema],
            default: [],
            validate: {
                validator: (images) => images.length <= 10,
                message: 'A product can have at most 10 gallery images',
            },
        },
        sku: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
        },
        brand: {
            type: String,
            trim: true,
            maxlength: [100, 'Brand cannot exceed 100 characters'],
            default: '',
        },
        tags: {
            type: [String],
            default: [],
            set: (tags) => [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
        },
        stock: {
            type: Number,
            min: [0, 'Stock cannot be negative'],
            default: 0,
            validate: {
                validator: Number.isInteger,
                message: 'Stock must be a whole number',
            },
        },
        status: {
            type: String,
            enum: {
                values: Object.values(PRODUCT_STATUS),
                message: '{VALUE} is not a valid product status',
            },
            default: PRODUCT_STATUS.ACTIVE,
        },
        isFeatured: {
            type: Boolean,
            default: false,
        },
        averageRating: {
            type: Number,
            min: 0,
            max: 5,
            default: 0,
        },
        reviewCount: {
            type: Number,
            min: 0,
            default: 0,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

productSchema.virtual('inStock').get(function getInStock() {
    return this.stock > 0;
});

productSchema.path('categories').validate(
    (categories) => categories.length > 0,
    'At least one category is required'
);

productSchema.pre('validate', function createSlug() {
    if (!this.slug && this.title) {
        this.slug = this.title
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
});

productSchema.index({ title: 'text', description: 'text', brand: 'text', tags: 'text' });
productSchema.index({ categories: 1, status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

module.exports = Product;
module.exports.PRODUCT_STATUS = PRODUCT_STATUS;
