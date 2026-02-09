const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');
const UserNotification = require('../models/UserNotification');
const User = require('../models/User');
const { authenticateUser } = require('../middleware/auth');

router.use(express.json());

/**
 * GET /api/notifications
 * List notifications for the current user (broadcast by role + per-user).
 * Only broadcast notifications created on or after the user's account creation are shown
 * (so new users do not see old admin notifications).
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userRole = req.user && req.user.role;
    const userId = req.user && req.user.id;
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'User role not found',
      });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
    const userDoc = userObjectId ? await User.findById(userObjectId).select('createdAt').lean() : null;
    const userCreatedAt = userDoc && userDoc.createdAt ? userDoc.createdAt : new Date(0);

    // Broadcast notifications (by role) – only those created on or after user's account creation
    const notifications = await Notification.find({
      status: 'active',
      createdAt: { $gte: userCreatedAt },
      $or: [
        { targetRoles: 'All' },
        { targetRoles: userRole },
      ],
    })
      .sort({ createdAt: -1 })
      .select('title message createdAt _id')
      .lean();

    const notificationIds = notifications.map((n) => n._id);
    let readSet = new Set();
    if (userObjectId && notificationIds.length > 0) {
      const reads = await NotificationRead.find({
        user: userObjectId,
        notification: { $in: notificationIds },
      })
        .select('notification')
        .lean();
      reads.forEach((r) => readSet.add(r.notification.toString()));
    }

    const broadcastList = notifications.map((n) => {
      const read = readSet.has(n._id.toString());
      return {
        id: n._id.toString(),
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        read,
      };
    });

    // Per-user notifications
    let userList = [];
    if (userObjectId) {
      const userNotifications = await UserNotification.find({ user: userObjectId })
        .sort({ createdAt: -1 })
        .select('title message createdAt _id readAt')
        .lean();
      userList = userNotifications.map((n) => ({
        id: n._id.toString(),
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        read: !!n.readAt,
      }));
    }

    // Merge and sort by createdAt desc
    const list = [...broadcastList, ...userList].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const unreadCount = list.filter((n) => !n.read).length;

    res.status(200).json({
      success: true,
      count: list.length,
      unreadCount,
      notifications: list,
    });
  } catch (error) {
    console.error('[Notifications] Error fetching user notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Returns unread notification count for current user (lightweight for navbar).
 * Only counts broadcast notifications created on or after the user's account creation.
 */
router.get('/unread-count', authenticateUser, async (req, res) => {
  try {
    const userRole = req.user && req.user.role;
    const userId = req.user && req.user.id;
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'User role not found',
      });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
    const userDoc = userObjectId ? await User.findById(userObjectId).select('createdAt').lean() : null;
    const userCreatedAt = userDoc && userDoc.createdAt ? userDoc.createdAt : new Date(0);

    const notifications = await Notification.find({
      status: 'active',
      createdAt: { $gte: userCreatedAt },
      $or: [
        { targetRoles: 'All' },
        { targetRoles: userRole },
      ],
    })
      .select('_id')
      .lean();

    const notificationIds = notifications.map((n) => n._id);
    let broadcastReadCount = 0;
    if (userObjectId && notificationIds.length > 0) {
      broadcastReadCount = await NotificationRead.countDocuments({
        user: userObjectId,
        notification: { $in: notificationIds },
      });
    }
    const broadcastUnread = Math.max(0, notificationIds.length - broadcastReadCount);

    let userUnreadCount = 0;
    if (userObjectId) {
      userUnreadCount = await UserNotification.countDocuments({
        user: userObjectId,
        readAt: null,
      });
    }

    res.status(200).json({
      success: true,
      unreadCount: broadcastUnread + userUnreadCount,
    });
  } catch (error) {
    console.error('[Notifications] Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/notifications/mark-read
 * Body: { all?: boolean, notificationIds?: string[] }
 * Mark notifications as read for current user (broadcast + user notifications).
 */
router.post('/mark-read', authenticateUser, async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    const userRole = req.user && req.user.role;
    if (!userId || !userRole) {
      return res.status(403).json({
        success: false,
        message: 'User not found',
      });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
    if (!userObjectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user',
      });
    }

    const userDoc = await User.findById(userObjectId).select('createdAt').lean();
    const userCreatedAt = userDoc && userDoc.createdAt ? userDoc.createdAt : new Date(0);

    const { all, notificationIds } = req.body || {};
    let broadcastIdsToMark = [];
    let userNotifIdsToMark = [];
    let userNotifsMarkedCount = 0;

    if (all === true) {
      const notifications = await Notification.find({
        status: 'active',
        createdAt: { $gte: userCreatedAt },
        $or: [
          { targetRoles: 'All' },
          { targetRoles: userRole },
        ],
      })
        .select('_id')
        .lean();
      broadcastIdsToMark = notifications.map((n) => n._id);
      const userResult = await UserNotification.updateMany(
        { user: userObjectId, readAt: null },
        { $set: { readAt: new Date() } }
      );
      userNotifsMarkedCount = userResult.modifiedCount;
    } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      for (const id of notificationIds) {
        if (!id || !mongoose.Types.ObjectId.isValid(id)) continue;
        const objId = new mongoose.Types.ObjectId(id);
        const userNotif = await UserNotification.findOneAndUpdate(
          { _id: objId, user: userObjectId, readAt: null },
          { $set: { readAt: new Date() } }
        );
        if (userNotif) {
          userNotifIdsToMark.push(objId);
        } else {
          broadcastIdsToMark.push(objId);
        }
      }
    }

    let marked = userNotifsMarkedCount + userNotifIdsToMark.length;
    if (broadcastIdsToMark.length > 0) {
      const ops = broadcastIdsToMark.map((notificationId) => ({
        updateOne: {
          filter: { user: userObjectId, notification: notificationId },
          update: { $setOnInsert: { user: userObjectId, notification: notificationId, readAt: new Date() } },
          upsert: true,
        },
      }));
      const result = await NotificationRead.bulkWrite(ops);
      marked += result.upsertedCount + result.modifiedCount;
    }

    if (all !== true && marked === 0 && userNotifIdsToMark.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Nothing to mark as read',
        marked: 0,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Marked as read',
      marked,
    });
  } catch (error) {
    console.error('[Notifications] Error marking as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
