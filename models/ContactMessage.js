const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  contactNo: {
    type: String,
    trim: true,
    default: null,
  },
  subject: {
    type: String,
    trim: true,
    default: null,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  adminReply: {
    type: String,
    trim: true,
    default: null,
  },
  repliedAt: {
    type: Date,
    default: null,
  },
  repliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

contactMessageSchema.index({ createdAt: -1 });

const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);

module.exports = ContactMessage;
