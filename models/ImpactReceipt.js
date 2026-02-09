const mongoose = require('mongoose');

const impactReceiptSchema = new mongoose.Schema({
  // Reference to the donation
  donationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donation',
    required: true,
    unique: true, // One receipt per donation
  },
  
  // Receiver who created the receipt
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // User input fields
  dropLocation: {
    type: String,
    required: true,
    trim: true,
  },
  
  peopleFed: {
    type: Number,
    required: true,
    min: 1,
  },
  
  // Weight per serving in kilograms (user input)
  weightPerServing: {
    type: Number,
    required: true,
    min: 0.001, // Minimum 1 gram
  },
  
  // Auto-calculated distance in kilometers
  distanceTraveled: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Auto-calculated methane saved in kilograms
  // Formula: CH₄ = MSW × 0.05
  // Where MSW = (quantity × weightPerServing) in tons
  methaneSaved: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update updatedAt before saving
impactReceiptSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

// Indexes
// donationId index is already created by unique: true in field definition
impactReceiptSchema.index({ receiverId: 1 });
impactReceiptSchema.index({ createdAt: -1 });

const ImpactReceipt = mongoose.model('ImpactReceipt', impactReceiptSchema);

module.exports = ImpactReceipt;
