const mongoose = require('mongoose');

const createSlug = (value) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Category name is required'],
            unique: true,
            trim: true,
            minlength: [2, 'Category name must be at least 2 characters'],
            maxlength: [80, 'Category name cannot exceed 80 characters'],
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    { timestamps: true }
);

categorySchema.pre('validate', function setSlug() {
    if (this.name && (this.isNew || this.isModified('name'))) {
        this.slug = createSlug(this.name);
    }
});

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

module.exports = Category;
module.exports.createSlug = createSlug;
