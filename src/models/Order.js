const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    items: [{
        bagId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bag', required: true },
        title: { type: String, required: true },
        mainImage: { type: String, default: '' },
        price: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        quantity: { type: Number, required: true },
        subtotal: { type: Number, required: true },
    }],
    delivery: {
        name: String,
        surname: String,
        address: String,
        moreInfo: String,
        region: String,
        district: String,
        locality: String,
        email: String,
        phonePrefix: String,
        phoneNumber: String,
    },
    total: { type: Number, required: true },
    savings: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    confirmToken: { type: String, required: true, unique: true },
    confirmedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
