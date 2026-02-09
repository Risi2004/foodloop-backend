const mongoose = require('mongoose');

const notificationReadSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  notification: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification',
    required: true,
  },
  readAt: {
    type: Date,
    default: Date.now,
  },
});

notificationReadSchema.index({ user: 1, notification: 1 }, { unique: true });
notificationReadSchema.index({ user: 1 });

const NotificationRead = mongoose.model('NotificationRead', notificationReadSchema);

module.exports = NotificationRead;
