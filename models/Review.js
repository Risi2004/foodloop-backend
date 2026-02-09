const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // User who submitted the review
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // User's role
  userRole: {
    type: String,
    enum: ['Donor', 'Receiver', 'Driver'],
    required: true,
  },
  
  // User's display name (stored for display even if user is deleted)
  userName: {
    type: String,
    required: true,
    trim: true,
  },
  
  // Review text content
  reviewText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  
  // Review status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  
  // Admin who approved/rejected
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  
  // Approval timestamp
  approvedAt: {
    type: Date,
    default: null,
  },
  
  // Rejection timestamp
  rejectedAt: {
    type: Date,
    default: null,
  },
  
  // Rejection reason
  rejectionReason: {
    type: String,
    trim: true,
    default: null,
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
reviewSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

// Indexes for efficient queries
reviewSchema.index({ status: 1 });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 }); // For pending reviews query

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
