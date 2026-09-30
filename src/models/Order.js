const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        title: { type: String, required: true },
        imageUrl: { type: String, default: null },
        productUrl: { type: String, default: null },
        quantity: { type: Number, required: true, min: 1 },
        unitAmount: { type: Number, required: true, min: 0 },
    }],
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, default: 'NGN' },
    reference: { type: String, required: true, unique: true },
    paymentMethod: { type: String, enum: ['paystack', 'whatsapp'], default: 'paystack' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    paidAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
