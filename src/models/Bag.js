const mongoose = require('mongoose');

const bagSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Bag title is required'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },

        description: {
            type: String,
            required: [true, 'Bag description is required'],
            trim: true,
            maxlength: [2000, 'Description cannot exceed 2000 characters'],
        },

        price: {
            type: Number,
            required: [true, 'Price is required'],
            min: [0, 'Price cannot be negative'],
        },

        dimensions: {
            height: {
                type: Number,
                min: [0, 'Height cannot be negative'],
            },
            width: {
                type: Number,
                min: [0, 'Width cannot be negative'],
            },
            depth: {
                type: Number,
                min: [0, 'Depth cannot be negative'],
            },
        },

        weight: {
            type: Number,
            min: [0, 'Weight cannot be negative'],
        },

        capacity: {
            type: String,
            trim: true,
        },

        color: {
            type: String,
            required: [true, 'Color is required'],
            trim: true,
        },

        mainImage: {
            type: String,
            required: [true, 'Main image is required'],
            trim: true,
        },

        sideImages: {
            type: [String],
            validate: {
                validator: function (arr) {
                    return arr.length <= 10;
                },
                message: 'Side images cannot exceed 10 items',
            },
            default: [],
        },

        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            default: null,
        },

        stock: {
            type: Number,
            min: [0, 'Stock cannot be negative'],
            default: 0,
        },

        productCategory: {
            type: String,
            required: [true, 'Product category is required'],
            enum: {
                values: ['Luggage', 'Backpacks', 'Bags', 'Accessories'],
                message: '{VALUE} is not a valid product category',
            },
        },
        subcategory:     { type: String, trim: true, default: '' },
        gender:          { type: String, default: '' },
    },
    {
        timestamps: true, // adds createdAt and updatedAt automatically
    }
);

const Bag = mongoose.model('Bag', bagSchema);

module.exports = Bag;