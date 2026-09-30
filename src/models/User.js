const mongoose = require('mongoose');

const USER_ROLES = Object.freeze({
    USER: 'user',
    ADMIN: 'admin',
});

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: [function () { return !this.googleId; }, 'First name is required'],
            trim: true,
            maxlength: [50, 'First name cannot exceed 50 characters'],
        },
        lastName: {
            type: String,
            required: [function () { return !this.googleId; }, 'Last name is required'],
            trim: true,
            maxlength: [50, 'Last name cannot exceed 50 characters'],
        },
        phoneNumber: {
            type: String,
            required: [function () { return !this.googleId; }, 'Phone number is required'],
            trim: true,
            match: [/^\+?[1-9]\d{7,14}$/, 'Please provide a valid phone number'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
        },
        password: {
            type: String,
            required: [function () { return !this.googleId; }, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false,
        },
        googleId: { type: String, select: false },
        role: {
            type: String,
            enum: {
                values: Object.values(USER_ROLES),
                message: '{VALUE} is not a valid role',
            },
            default: USER_ROLES.USER,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_document, returnedObject) => {
                delete returnedObject.password;
                delete returnedObject.googleId;
                return returnedObject;
            },
        },
    }
);

userSchema.index({ phoneNumber: 1 }, { unique: true, partialFilterExpression: { phoneNumber: { $type: 'string' } } });
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
module.exports.USER_ROLES = USER_ROLES;
