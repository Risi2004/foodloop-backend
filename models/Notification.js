const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
    default: 'Update',
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  targetRoles: {
    type: [String],
    required: true,
    enum: ['Donor', 'Receiver', 'Driver', 'All'],
    validate: {
      validator: function (v) {
        return v && v.length > 0;
      },
      message: 'At least one target role is required',
    },
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ targetRoles: 1 });
notificationSchema.index({ status: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
