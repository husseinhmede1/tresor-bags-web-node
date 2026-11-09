const mongoose = require('mongoose');

// Facts about the shop that the assistant may use in its answers (delivery, payment,
// returns...). The team edits them from the admin "Info" page.
const INFO_CATEGORIES = ['delivery', 'payment', 'returns', 'store', 'general'];

const storeInfoSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
            maxlength: [120, 'Title cannot exceed 120 characters'],
        },
        answer: {
            type: String,
            required: [true, 'Answer is required'],
            trim: true,
            maxlength: [800, 'Answer cannot exceed 800 characters'],
        },
        category: {
            type: String,
            enum: { values: INFO_CATEGORIES, message: '{VALUE} is not a valid category' },
            default: 'general',
        },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

const StoreInfo = mongoose.model('StoreInfo', storeInfoSchema);
StoreInfo.INFO_CATEGORIES = INFO_CATEGORIES;
module.exports = StoreInfo;
