const mongoose = require('mongoose');

// A Collection is a global product line (e.g. "Alpha", "Voyageur") that can
// span many Types and Categories. Bags reference a Collection directly.
const collectionSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Collection title is required'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        logo: {
            type: String, // base64 image, optional
            default: '',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Collection', collectionSchema);
