const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  // Donor information
  donorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // Food details
  foodCategory: {
    type: String,
    required: true,
    enum: ['Cooked Meals', 'Raw Food', 'Beverages', 'Snacks', 'Desserts'],
  },
  itemName: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  storageRecommendation: {
    type: String,
    required: true,
    enum: ['Hot', 'Cold', 'Dry'],
  },
  
  // Image
  imageUrl: {
    type: String,
    required: true,
  },
  
  // AI Analysis data
  aiConfidence: {
    type: Number,
    default: null,
    min: 0,
    max: 1,
  },
  aiQualityScore: {
    type: Number,
    default: null,
    min: 0,
    max: 1,
  },
  aiFreshness: {
    type: String,
    enum: ['Fresh', 'Good', 'Fair'],
    default: null,
  },
  aiDetectedItems: {
    type: [String],
    default: [],
  },
  
  // Pickup information
  preferredPickupDate: {
    type: Date,
    required: true,
  },
  preferredPickupTimeFrom: {
    type: String,
    required: true,
  },
  preferredPickupTimeTo: {
    type: String,
    required: true,
  },
  actualPickupDate: {
    type: Date,
    default: null,
  },
  
  // Product type and expiry
  productType: {
    type: String,
    enum: ['cooked', 'packed'],
    default: null,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  expiryDateFromPackage: {
    type: Date,
    default: null,
  },
  
  // Donor information (stored for quick access)
  donorAddress: {
    type: String,
    required: true,
  },
  donorEmail: {
    type: String,
    required: true,
  },
  // Donor location coordinates (optional - for map display)
  donorLatitude: {
    type: Number,
    default: null,
  },
  donorLongitude: {
    type: Number,
    default: null,
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'approved', 'assigned', 'picked_up', 'delivered', 'cancelled'],
    default: 'pending',
  },
  
  // Assignment
  assignedDriverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  assignedReceiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // Receiver delivery location (set at claim time when receiver confirms on map)
  receiverLatitude: {
    type: Number,
    default: null,
  },
  receiverLongitude: {
    type: Number,
    default: null,
  },
  receiverAddress: {
    type: String,
    default: null,
  },
  
  // Tracking
  trackingId: {
    type: String,
    unique: true,
    sparse: true,
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

// Generate tracking ID before saving
donationSchema.pre('save', async function() {
  if (this.isNew && !this.trackingId) {
    // Generate tracking ID: FL-YYYYMMDD-XXXX
    const date = new Date();
    const dateStr = date.getFullYear().toString() + 
                   (date.getMonth() + 1).toString().padStart(2, '0') + 
                   date.getDate().toString().padStart(2, '0');
    
    // Get count of donations today for unique ID
    const count = await mongoose.model('Donation').countDocuments({
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
      }
    });
    
    const sequence = (count + 1).toString().padStart(2, '0');
    this.trackingId = `FL-${dateStr}-${sequence}`;
  }
  
  this.updatedAt = Date.now();
});

// Index for efficient queries
donationSchema.index({ donorId: 1, createdAt: -1 });
donationSchema.index({ status: 1 });
// trackingId index is already created by unique: true in field definition

const Donation = mongoose.model('Donation', donationSchema);

module.exports = Donation;
