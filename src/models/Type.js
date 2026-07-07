const mongoose = require('mongoose');

const PRODUCT_CATEGORIES = ['Backpacks', 'Luggage', 'Bags', 'Accessories'];

const typeSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Type title is required'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        // The fixed top-level category this type belongs to.
        category: {
            type: String,
            required: [true, 'Category is required'],
            enum: {
                values: PRODUCT_CATEGORIES,
                message: '{VALUE} is not a valid category',
            },
        },
        discount: {
            type: Number,
            default: 0,
            min: [0, 'Discount cannot be less than 0'],
            max: [100, 'Discount cannot exceed 100'],
        },
        note: {
            type: String,
            trim: true,
            maxlength: [500, 'Note cannot exceed 500 characters'],
            default: '',
        },
    },
    { timestamps: true }
);

const Type = mongoose.model('Type', typeSchema);
Type.PRODUCT_CATEGORIES = PRODUCT_CATEGORIES;
module.exports = Type;
