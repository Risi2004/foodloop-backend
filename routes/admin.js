const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ContactMessage = require('../models/ContactMessage');
const Notification = require('../models/Notification');
const UserNotification = require('../models/UserNotification');
const { authenticateAdmin } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail, sendDeactivationEmail, sendActivationEmail, sendContactReplyEmail, sendNotificationEmail } = require('../utils/emailService');
const socketService = require('../services/socketService');

// Apply JSON body parser and admin authentication to all routes
router.use(express.json());
router.use(authenticateAdmin);

/**
 * GET /api/admin/stats
 * Dashboard counts: donors, drivers, receivers (completed), and pending users
 */
router.get('/stats', async (req, res) => {
  try {
    const [donors, drivers, receivers, pending] = await Promise.all([
      User.countDocuments({ role: 'Donor', status: 'completed' }),
      User.countDocuments({ role: 'Driver', status: 'completed' }),
      User.countDocuments({ role: 'Receiver', status: 'completed' }),
      User.countDocuments({ status: 'pending' }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        donors,
        drivers,
        receivers,
        pending,
      },
    });
  } catch (error) {
    console.error('[Admin] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/admin/users/pending
 * Fetch all users with status: 'pending'
 * Returns users sorted by createdAt (newest first)
 */
router.get('/users/pending', async (req, res) => {
  try {
    const pendingUsers = await User.find({ status: 'pending' })
      .select('-password') // Exclude password
      .sort({ createdAt: -1 }) // Newest first
      .lean(); // Return plain JavaScript objects

    // Format user data for frontend
    const formattedUsers = pendingUsers.map(user => {
      const userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        contactNo: user.contactNo,
        address: user.address,
        profileImageUrl: user.profileImageUrl,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      // Add role-specific fields
      if (user.role === 'Donor') {
        userData.donorType = user.donorType;
        userData.username = user.username;
        userData.businessName = user.businessName;
        userData.businessType = user.businessType;
      } else if (user.role === 'Receiver') {
        userData.receiverName = user.receiverName;
        userData.receiverType = user.receiverType;
      } else if (user.role === 'Driver') {
        userData.driverName = user.driverName;
        userData.vehicleNumber = user.vehicleNumber;
        userData.vehicleType = user.vehicleType;
      }

      // IMPORTANT: Include ALL document fields regardless of role
      // This ensures we show all documents that were uploaded during signup
      userData.businessRegFileUrl = user.businessRegFileUrl;
      userData.addressProofFileUrl = user.addressProofFileUrl;
      userData.nicFileUrl = user.nicFileUrl;
      userData.licenseFileUrl = user.licenseFileUrl;

      return userData;
    });

    res.status(200).json({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
    });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Update user status (approve or reject)
 * Body: { status: 'completed' | 'rejected' }
 */
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body;

    // Debug: Log the received status
    console.log('Received status update request:', { id, status, body: req.body, statusType: typeof status });

    // Normalize status (trim whitespace and convert to lowercase)
    if (status && typeof status === 'string') {
      status = status.trim().toLowerCase();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Status is required and must be a string',
      });
    }

    // Validate status value (all enum values are lowercase)
    const validStatuses = ['completed', 'rejected', 'inactive'];
    if (!validStatuses.includes(status)) {
      console.error('Invalid status received:', status, 'Type:', typeof status, 'Body:', req.body);
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}. Received: ${status || 'undefined'}`,
      });
    }

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Save previous status before updating
    const previousStatus = user.status;

    // Update status
    user.status = status;
    await user.save();

    // Notify user's clients immediately when deactivated (so they sign out)
    if (status === 'inactive') {
      socketService.emitToUser(id, 'account_deactivated', {});
    }

    // Send email notification based on status change
    try {
      if (status === 'completed') {
        // Check if user was previously inactive (reactivation) or pending (new approval)
        if (previousStatus === 'inactive') {
          await sendActivationEmail(user);
        } else {
          await sendApprovalEmail(user);
        }
      } else if (status === 'rejected') {
        await sendRejectionEmail(user);
      } else if (status === 'inactive') {
        await sendDeactivationEmail(user);
      }
    } catch (emailError) {
      // Log email error but don't fail status update
      console.error('Email sending error (admin status update):', emailError.message);
    }

    // Prepare response (exclude password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: `User ${status === 'completed' ? 'approved' : 'rejected'} successfully`,
      user: userResponse,
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/admin/users
 * Fetch all users with optional filters
 * Query params: status, role
 */
router.get('/users', async (req, res) => {
  try {
    const { status, role } = req.query;
    
    // Build query
    const query = {};
    if (status) {
      query.status = status;
    }
    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    // Format user data
    const formattedUsers = users.map(user => {
      const userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        contactNo: user.contactNo,
        address: user.address,
        profileImageUrl: user.profileImageUrl,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      // Add role-specific fields
      if (user.role === 'Donor') {
        userData.donorType = user.donorType;
        userData.username = user.username;
        userData.businessName = user.businessName;
        userData.businessType = user.businessType;
      } else if (user.role === 'Receiver') {
        userData.receiverName = user.receiverName;
        userData.receiverType = user.receiverType;
      } else if (user.role === 'Driver') {
        userData.driverName = user.driverName;
        userData.vehicleNumber = user.vehicleNumber;
        userData.vehicleType = user.vehicleType;
      }

      // IMPORTANT: Include ALL document fields regardless of role
      // This ensures we show all documents that were uploaded during signup
      userData.businessRegFileUrl = user.businessRegFileUrl;
      userData.addressProofFileUrl = user.addressProofFileUrl;
      userData.nicFileUrl = user.nicFileUrl;
      userData.licenseFileUrl = user.licenseFileUrl;

      return userData;
    });

    res.status(200).json({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/admin/messages
 * List all contact messages (newest first)
 */
router.get('/messages', async (req, res) => {
  try {
    const messages = await ContactMessage.find({})
      .sort({ createdAt: -1 })
      .lean();

    const formatted = messages.map((m) => ({
      id: m._id.toString(),
      userId: m.userId ? m.userId.toString() : null,
      name: m.name,
      email: m.email,
      contactNo: m.contactNo,
      subject: m.subject,
      message: m.message,
      adminReply: m.adminReply,
      repliedAt: m.repliedAt,
      repliedBy: m.repliedBy ? m.repliedBy.toString() : null,
      createdAt: m.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      messages: formatted,
    });
  } catch (error) {
    console.error('[Admin] Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/admin/messages/:id/reply
 * Reply to a contact message and send reply by email
 * Body: { reply: string }
 */
router.post('/messages/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply || typeof reply !== 'string' || !reply.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reply text is required',
      });
    }

    const contactMessage = await ContactMessage.findById(id);
    if (!contactMessage) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    const adminId = req.user && req.user.id;
    const updateData = {
      adminReply: reply.trim(),
      repliedAt: new Date(),
      updatedAt: new Date(),
    };
    if (adminId && adminId !== 'admin_static_id' && String(adminId).match(/^[0-9a-fA-F]{24}$/)) {
      updateData.repliedBy = adminId;
    }

    await ContactMessage.findByIdAndUpdate(id, updateData);

    try {
      await sendContactReplyEmail(contactMessage.email, contactMessage.name, reply.trim());
    } catch (emailError) {
      console.error('[Admin] Error sending reply email:', emailError);
    }

    // If the contact submitter is a registered user, create an in-app notification
    try {
      let targetUserId = contactMessage.userId;
      if (!targetUserId && contactMessage.email) {
        const registeredUser = await User.findOne({
          email: contactMessage.email.trim().toLowerCase(),
          status: 'completed',
        })
          .select('_id')
          .lean();
        if (registeredUser) targetUserId = registeredUser._id;
      }
      if (targetUserId) {
        const replyText = reply.trim();
        const maxLength = 500;
        const displayReply = replyText.length <= maxLength ? replyText : replyText.slice(0, maxLength - 3) + '...';
        const userNotification = new UserNotification({
          user: targetUserId,
          title: 'Reply from FoodLoop',
          message: `Admin replied to your contact message.\n\n${displayReply}`,
        });
        await userNotification.save();
      }
    } catch (notifError) {
      console.error('[Admin] Error creating user notification for contact reply:', notifError);
    }

    res.status(200).json({
      success: true,
      message: 'Reply sent successfully',
    });
  } catch (error) {
    console.error('[Admin] Error replying to message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reply',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/admin/notifications
 * Create a notification (admin only). Body: { message, title?, roles }
 */
router.post('/notifications', async (req, res) => {
  try {
    const { message, title, roles } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one role is required',
      });
    }

    const validRoles = ['Donor', 'Receiver', 'Driver', 'All'];
    const normalized = roles.map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
    const invalid = normalized.filter((r) => !validRoles.includes(r));
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role(s). Use Donor, Receiver, Driver, or All',
      });
    }

    const targetRoles = normalized.includes('All') ? ['All'] : [...new Set(normalized)];
    const adminId = req.user && req.user.id;
    const createdBy = adminId && adminId !== 'admin_static_id' && String(adminId).match(/^[0-9a-fA-F]{24}$/) ? adminId : null;

    const notification = new Notification({
      title: title && typeof title === 'string' ? title.trim() : 'Update',
      message: message.trim(),
      targetRoles,
      status: 'active',
      createdBy,
    });

    await notification.save();

    // Send emails to relevant users (non-blocking)
    (async () => {
      try {
        const rolesToMatch = targetRoles.includes('All')
          ? ['Donor', 'Receiver', 'Driver']
          : targetRoles;
        const query = { role: { $in: rolesToMatch }, status: 'completed' };
        const users = await User.find(query).select('email').lean();
        const title = notification.title || 'Update';
        const message = notification.message;
        for (const u of users) {
          if (u.email) {
            try {
              await sendNotificationEmail(u.email, title, message);
            } catch (emailErr) {
              console.error(`[Admin] Failed to send notification email to ${u.email}:`, emailErr.message);
            }
          }
        }
      } catch (err) {
        console.error('[Admin] Error sending notification emails:', err);
      }
    })();

    res.status(201).json({
      success: true,
      message: 'Notification created',
      notification: {
        id: notification._id.toString(),
        title: notification.title,
        message: notification.message,
        targetRoles: notification.targetRoles,
        status: notification.status,
        createdAt: notification.createdAt,
      },
    });
  } catch (error) {
    console.error('[Admin] Error creating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/admin/notifications
 * List all notifications (admin only)
 */
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({})
      .sort({ createdAt: -1 })
      .lean();

    const formatted = notifications.map((n) => ({
      id: n._id.toString(),
      title: n.title,
      message: n.message,
      targetRoles: n.targetRoles,
      status: n.status,
      createdAt: n.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      notifications: formatted,
    });
  } catch (error) {
    console.error('[Admin] Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
