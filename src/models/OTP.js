const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: ['email_verification', 'password_reset', 'email_change'] },
    codeHash: { type: String, required: true, select: false },
    payload: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.models.OTP || mongoose.model('OTP', otpSchema);
