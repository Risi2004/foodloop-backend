const mongoose = require('mongoose');

const donationMessageSchema = new mongoose.Schema({
  donationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donation',
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

donationMessageSchema.index({ donationId: 1, createdAt: 1 });

const DonationMessage = mongoose.model('DonationMessage', donationMessageSchema);

module.exports = DonationMessage;
