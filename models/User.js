const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // Common fields for all roles
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
    enum: ['Donor', 'Receiver', 'Driver', 'Admin'],
  },
  contactNo: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  profileImageUrl: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'rejected', 'inactive'],
    default: 'pending',
  },

  // Donor-specific fields
  donorType: {
    type: String,
    enum: ['Individual', 'Business'],
    default: null,
  },
  username: {
    type: String,
    sparse: true, // Allows null/undefined values but enforces uniqueness when present
    unique: true,
    // No default - field will be undefined if not set, which works better with sparse index
  },
  businessName: {
    type: String,
    default: null,
  },
  businessType: {
    type: String,
    enum: ['Restaurant', 'Supermarket', 'Wedding Hall'],
    default: null,
  },
  businessRegFileUrl: {
    type: String,
    default: null,
  },
  addressProofFileUrl: {
    type: String,
    default: null,
  },

  // Receiver-specific fields
  receiverName: {
    type: String,
    default: null,
  },
  receiverType: {
    type: String,
    enum: ['NGO', 'Food Banks', 'Service Organization'],
    default: null,
  },

  // Driver-specific fields
  driverName: {
    type: String,
    default: null,
  },
  vehicleNumber: {
    type: String,
    default: null,
  },
  vehicleType: {
    type: String,
    enum: ['Scooter', 'Bike', 'Car', 'Truck'],
    default: null,
  },
  nicFileUrl: {
    type: String,
    default: null,
  },
  licenseFileUrl: {
    type: String,
    default: null,
  },
  // Driver location (for real-time tracking)
  driverLatitude: {
    type: Number,
    default: null,
  },
  driverLongitude: {
    type: Number,
    default: null,
  },

  // Password reset (optional; cleared after use or expiry)
  resetToken: {
    type: String,
    default: null,
  },
  resetTokenExpires: {
    type: Date,
    default: null,
  },

}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
});

// Hash password before saving
userSchema.pre('save', async function () {
  // Only hash password if it's been modified (or is new)
  if (!this.isModified('password')) {
    return;
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
