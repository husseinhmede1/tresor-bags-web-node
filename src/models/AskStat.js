const mongoose = require('mongoose');

// How often customers use the shop assistant, per hour and per place on the site.
// Counts only: what was asked is not kept here.
const askStatSchema = new mongoose.Schema({
    hour: { type: Date, required: true },                                   // start of the hour
    place: { type: String, enum: ['home', 'shop', 'bag'], required: true }, // where it was asked
    questions: { type: Number, default: 0 },
    photos: { type: Number, default: 0 },                                   // of those, with a photo
});
askStatSchema.index({ hour: 1, place: 1 }, { unique: true });

module.exports = mongoose.model('AskStat', askStatSchema);
