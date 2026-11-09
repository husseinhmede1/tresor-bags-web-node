const mongoose = require('mongoose');

// Shop questions the assistant had no data for. Only the question text is kept
// (no customer details); repeats of the same question bump `count`.
const unansweredSchema = new mongoose.Schema(
    {
        text: { type: String, required: true, trim: true, maxlength: 300 },
        key: { type: String, required: true, unique: true }, // normalized text, for de-duplication
        count: { type: Number, default: 1 },
        lastAskedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ['open', 'answered', 'ignored'], default: 'open' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('UnansweredQuestion', unansweredSchema);
