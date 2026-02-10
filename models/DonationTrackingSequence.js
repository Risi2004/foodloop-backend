const mongoose = require('mongoose');

const donationTrackingSequenceSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  seq: {
    type: Number,
    default: 0,
    required: true,
  },
}, { _id: true });

const DonationTrackingSequence = mongoose.model('DonationTrackingSequence', donationTrackingSequenceSchema);

/**
 * Get the next sequence number for a given date (YYYYMMDD). Atomic.
 * @param {string} dateKey - Date string in YYYYMMDD format
 * @returns {Promise<number>} Next sequence number for that day (1, 2, 3, ...)
 */
async function getNextSequenceForDate(dateKey) {
  const doc = await DonationTrackingSequence.findOneAndUpdate(
    { _id: dateKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

module.exports = { DonationTrackingSequence, getNextSequenceForDate };
