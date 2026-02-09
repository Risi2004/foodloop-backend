const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
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
  readAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userNotificationSchema.index({ user: 1, createdAt: -1 });
userNotificationSchema.index({ user: 1, readAt: 1 });

const UserNotification = mongoose.model('UserNotification', userNotificationSchema);

module.exports = UserNotification;
