const mongoose = require('mongoose');

const typeSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Type title is required'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        logo: {
            type: String, // base64 image
            default: '',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Type', typeSchema);
