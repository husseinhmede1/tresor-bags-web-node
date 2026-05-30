const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Category title is required'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
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

const Category = mongoose.model('Category', categorySchema);
module.exports = Category;
