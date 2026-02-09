const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Donation = require('../models/Donation');
const UserNotification = require('../models/UserNotification');
const NotificationRead = require('../models/NotificationRead');
const Review = require('../models/Review');
const ImpactReceipt = require('../models/ImpactReceipt');
const ContactMessage = require('../models/ContactMessage');
const Notification = require('../models/Notification');
const { authenticateUser } = require('../middleware/auth');
const socketService = require('../services/socketService');
const { sendProfileUpdatedEmail } = require('../utils/emailService');
const { handleFileUpload } = require('../middleware/upload');
const { uploadFileToS3 } = require('../config/awsS3');

// Authentication first (no body needed - uses Bearer token)
router.use(authenticateUser);

/**
 * PATCH /api/users/me/avatar
 * Upload profile picture (any role). Must be BEFORE express.json() so multipart body is not consumed.
 * Accepts multipart with field "avatar".
 */
router.patch('/me/avatar', handleFileUpload, async (req, res) => {
  try {
    const file = req.files?.avatar?.[0] || req.files?.profileImage?.[0];
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided. Use field name "avatar" or "profileImage".',
      });
    }
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'File must be an image (e.g. JPEG, PNG)',
      });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    const imageUrl = await uploadFileToS3(file, 'profile-images');
    user.profileImageUrl = imageUrl;
    await user.save();
    const userResponse = user.toObject();
    delete userResponse.password;
    res.status(200).json({
      success: true,
      message: 'Profile picture updated',
      user: userResponse,
    });
  } catch (error) {
    console.error('[Users] Error updating avatar:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile picture',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// JSON body parser for all other routes (after avatar so multipart is not consumed)
router.use(express.json());

/**
 * GET /api/users/me
 * Get current user profile (any role). Used for donor/receiver/driver profile pages.
 */
router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('[Users] Error fetching current user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * DELETE /api/users/me
 * Delete current user account and all related data. Restricted to Donor, Receiver, Driver (not Admin).
 */
router.delete('/me', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    if (role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin accounts cannot be deleted via this endpoint',
      });
    }

    await UserNotification.deleteMany({ user: userId });
    await NotificationRead.deleteMany({ user: userId });
    await Review.deleteMany({ userId });
    await ImpactReceipt.deleteMany({ receiverId: userId });

    if (role === 'Donor') {
      const donorDonations = await Donation.find({ donorId: userId }).select('_id').lean();
      const donationIds = donorDonations.map((d) => d._id);
      if (donationIds.length > 0) {
        await ImpactReceipt.deleteMany({ donationId: { $in: donationIds } });
      }
      await Donation.deleteMany({ donorId: userId });
    } else if (role === 'Receiver') {
      await Donation.updateMany(
        { assignedReceiverId: userId },
        { $set: { assignedReceiverId: null } }
      );
    } else if (role === 'Driver') {
      await Donation.updateMany(
        { assignedDriverId: userId },
        { $set: { assignedDriverId: null } }
      );
    }

    await ContactMessage.updateMany({ userId }, { $set: { userId: null } });
    await ContactMessage.updateMany({ repliedBy: userId }, { $set: { repliedBy: null } });
    await Notification.updateMany({ createdBy: userId }, { $set: { createdBy: null } });

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'Account deleted',
    });
  } catch (error) {
    console.error('[Users] Error deleting account:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * PATCH /api/users/me/location
 * Update current user's location (for drivers)
 * Requires authentication
 */
router.patch('/me/location', async (req, res) => {
  try {
    // Check if user is a Driver
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can update their location',
      });
    }

    const { latitude, longitude } = req.body;

    // Validate inputs
    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
        errors: [
          { field: 'latitude', message: 'Latitude is required' },
          { field: 'longitude', message: 'Longitude is required' },
        ],
      });
    }

    // Validate coordinate types
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude must be valid numbers',
        errors: [
          { field: 'latitude', message: 'Latitude must be a valid number' },
          { field: 'longitude', message: 'Longitude must be a valid number' },
        ],
      });
    }

    // Validate coordinates are within Sri Lanka bounds
    // Sri Lanka is approximately: lat 5.9-9.8, lng 79.7-81.9
    if (lat < 5 || lat > 10 || lng < 79 || lng > 82) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates are outside Sri Lanka bounds',
        errors: [
          { field: 'latitude', message: 'Latitude must be between 5 and 10' },
          { field: 'longitude', message: 'Longitude must be between 79 and 82' },
        ],
      });
    }

    // Find and update user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update location
    user.driverLatitude = lat;
    user.driverLongitude = lng;
    await user.save();

    socketService.emitDriverLocation(req.user.id, lat, lng).catch((err) => {
      console.error('[Users] Socket emit error:', err);
    });

    console.log(`[Users] Driver location updated: ${req.user.id} -> [${lat}, ${lng}]`);

    // Prepare response (exclude password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      location: {
        latitude: user.driverLatitude,
        longitude: user.driverLongitude,
      },
      user: userResponse,
    });
  } catch (error) {
    console.error('[Users] Error updating driver location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * PATCH /api/users/me
 * Update current user profile.
 * Driver: driverName, contactNo, address, email, vehicleNumber, vehicleType
 * Donor: businessName, businessType, email, contactNo, address, username (for Individual)
 * Receiver: receiverName, receiverType, email, contactNo, address
 * Requires authentication
 */
router.patch('/me', async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'Driver' && role !== 'Donor' && role !== 'Receiver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers, donors, and receivers can update profile via this endpoint',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let changedFields = [];

    if (role === 'Driver') {
      const prevDriverName = user.driverName;
      const prevContactNo = user.contactNo;
      const prevAddress = user.address;
      const prevEmail = user.email;
      const prevVehicleNumber = user.vehicleNumber;
      const prevVehicleType = user.vehicleType;

      const { driverName, contactNo, address, email, vehicleNumber, vehicleType } = req.body;

      if (driverName !== undefined) {
        user.driverName = typeof driverName === 'string' ? driverName.trim() || null : user.driverName;
      }
      if (contactNo !== undefined) {
        const val = typeof contactNo === 'string' ? contactNo.trim() : '';
        if (val) user.contactNo = val;
      }
      if (address !== undefined) {
        const val = typeof address === 'string' ? address.trim() : '';
        if (val) user.address = val;
      }
      if (vehicleNumber !== undefined) {
        user.vehicleNumber = typeof vehicleNumber === 'string' ? vehicleNumber.trim() || null : user.vehicleNumber;
      }
      if (vehicleType !== undefined) {
        const allowed = ['Scooter', 'Bike', 'Car', 'Truck'];
        user.vehicleType = allowed.includes(vehicleType) ? vehicleType : user.vehicleType;
      }
      if (email !== undefined) {
        const newEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
        if (newEmail) {
          if (newEmail !== user.email) {
            const existing = await User.findOne({ email: newEmail });
            if (existing) {
              return res.status(409).json({
                success: false,
                message: 'Email already in use',
              });
            }
            user.email = newEmail;
          }
        }
      }

      await user.save();

      if (prevDriverName !== user.driverName) changedFields.push('Name');
      if (prevContactNo !== user.contactNo) changedFields.push('Contact Number');
      if (prevAddress !== user.address) changedFields.push('Address');
      if (prevEmail !== user.email) changedFields.push('Email');
      if (prevVehicleNumber !== user.vehicleNumber) changedFields.push('Vehicle Number');
      if (prevVehicleType !== user.vehicleType) changedFields.push('Vehicle Type');
    } else if (role === 'Donor') {
      const prevBusinessName = user.businessName;
      const prevBusinessType = user.businessType;
      const prevContactNo = user.contactNo;
      const prevAddress = user.address;
      const prevEmail = user.email;
      const prevUsername = user.username;

      const { businessName, businessType, email, contactNo, address, username } = req.body;

      if (businessName !== undefined) {
        user.businessName = typeof businessName === 'string' ? businessName.trim() || null : user.businessName;
      }
      if (businessType !== undefined) {
        const allowed = ['Restaurant', 'Supermarket', 'Wedding Hall'];
        user.businessType = allowed.includes(businessType) ? businessType : user.businessType;
      }
      if (contactNo !== undefined) {
        const val = typeof contactNo === 'string' ? contactNo.trim() : '';
        if (val) user.contactNo = val;
      }
      if (address !== undefined) {
        const val = typeof address === 'string' ? address.trim() : '';
        if (val) user.address = val;
      }
      if (username !== undefined) {
        const val = typeof username === 'string' ? username.trim() || null : null;
        if (val !== null) {
          const existing = await User.findOne({ username: val, _id: { $ne: user._id } });
          if (existing) {
            return res.status(409).json({
              success: false,
              message: 'Username already in use',
            });
          }
          user.username = val;
        } else {
          user.username = null;
        }
      }
      if (email !== undefined) {
        const newEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
        if (newEmail) {
          if (newEmail !== user.email) {
            const existing = await User.findOne({ email: newEmail });
            if (existing) {
              return res.status(409).json({
                success: false,
                message: 'Email already in use',
              });
            }
            user.email = newEmail;
          }
        }
      }

      await user.save();

      if (prevBusinessName !== user.businessName) changedFields.push('Business Name');
      if (prevBusinessType !== user.businessType) changedFields.push('Business Type');
      if (prevContactNo !== user.contactNo) changedFields.push('Contact Number');
      if (prevAddress !== user.address) changedFields.push('Address');
      if (prevEmail !== user.email) changedFields.push('Email');
      if (prevUsername !== user.username) changedFields.push('Username');
    } else if (role === 'Receiver') {
      const prevReceiverName = user.receiverName;
      const prevReceiverType = user.receiverType;
      const prevContactNo = user.contactNo;
      const prevAddress = user.address;
      const prevEmail = user.email;

      const { receiverName, receiverType, email, contactNo, address } = req.body;

      if (receiverName !== undefined) {
        user.receiverName = typeof receiverName === 'string' ? receiverName.trim() || null : user.receiverName;
      }
      if (receiverType !== undefined) {
        const allowed = ['NGO', 'Food Banks', 'Service Organization'];
        user.receiverType = allowed.includes(receiverType) ? receiverType : user.receiverType;
      }
      if (contactNo !== undefined) {
        const val = typeof contactNo === 'string' ? contactNo.trim() : '';
        if (val) user.contactNo = val;
      }
      if (address !== undefined) {
        const val = typeof address === 'string' ? address.trim() : '';
        if (val) user.address = val;
      }
      if (email !== undefined) {
        const newEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
        if (newEmail) {
          if (newEmail !== user.email) {
            const existing = await User.findOne({ email: newEmail });
            if (existing) {
              return res.status(409).json({
                success: false,
                message: 'Email already in use',
              });
            }
            user.email = newEmail;
          }
        }
      }

      await user.save();

      if (prevReceiverName !== user.receiverName) changedFields.push('Organization Name');
      if (prevReceiverType !== user.receiverType) changedFields.push('Organization Type');
      if (prevContactNo !== user.contactNo) changedFields.push('Contact Number');
      if (prevAddress !== user.address) changedFields.push('Address');
      if (prevEmail !== user.email) changedFields.push('Email');
    }

    if (changedFields.length > 0) {
      sendProfileUpdatedEmail(user.email, changedFields).catch((err) => {
        console.error('[Users] Profile updated email error:', err);
      });
    }

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: userResponse,
    });
  } catch (error) {
    console.error('[Users] Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// --- Server-side demo: continues movement after driver signs out ---
const DEMO_INTERVAL_MS = 2500;
const activeDemoByDriver = new Map(); // driverId -> { intervalId, waypoints, currentIndex }

/**
 * POST /api/users/me/demo/start
 * Start server-side demo: advance driver location along waypoints every 2.5s.
 * Donor/receiver see movement via tracking API even if driver signs out.
 */
router.post('/me/demo/start', async (req, res) => {
  try {
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can start demo',
      });
    }

    const { waypoints } = req.body;
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'waypoints array is required and must not be empty',
      });
    }

    const driverId = req.user.id;

    // Stop any existing demo for this driver
    const existing = activeDemoByDriver.get(driverId);
    if (existing && existing.intervalId) {
      clearInterval(existing.intervalId);
      activeDemoByDriver.delete(driverId);
    }

    const normalizedWaypoints = waypoints.map((w) => ({
      latitude: typeof w.latitude === 'number' ? w.latitude : parseFloat(w.latitude),
      longitude: typeof w.longitude === 'number' ? w.longitude : parseFloat(w.longitude),
    })).filter((w) => !isNaN(w.latitude) && !isNaN(w.longitude));

    if (normalizedWaypoints.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid waypoints (latitude, longitude) are required',
      });
    }

    let currentIndex = 0;
    const intervalId = setInterval(async () => {
      const wp = normalizedWaypoints[currentIndex];
      if (!wp) {
        clearInterval(intervalId);
        activeDemoByDriver.delete(driverId);
        return;
      }
      try {
        const user = await User.findById(driverId);
        if (user) {
          user.driverLatitude = wp.latitude;
          user.driverLongitude = wp.longitude;
          await user.save();
          socketService.emitDriverLocation(driverId, wp.latitude, wp.longitude).catch((err) => {
            console.error('[Users] Demo socket emit error:', err);
          });
        }
      } catch (err) {
        console.error('[Users] Demo tick error:', err);
      }
      currentIndex += 1;
      if (currentIndex >= normalizedWaypoints.length) {
        clearInterval(intervalId);
        activeDemoByDriver.delete(driverId);
      }
    }, DEMO_INTERVAL_MS);

    activeDemoByDriver.set(driverId, { intervalId, waypoints: normalizedWaypoints, currentIndex: 0 });
    console.log(`[Users] Demo started for driver ${driverId}, ${normalizedWaypoints.length} waypoints`);

    res.status(200).json({
      success: true,
      message: 'Demo started. Movement will continue on the server even if you sign out.',
      waypointCount: normalizedWaypoints.length,
    });
  } catch (error) {
    console.error('[Users] Error starting demo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start demo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/users/me/demo/stop
 * Stop server-side demo for this driver.
 */
router.post('/me/demo/stop', async (req, res) => {
  try {
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can stop demo',
      });
    }

    const driverId = req.user.id;
    const existing = activeDemoByDriver.get(driverId);
    if (existing && existing.intervalId) {
      clearInterval(existing.intervalId);
      activeDemoByDriver.delete(driverId);
      console.log(`[Users] Demo stopped for driver ${driverId}`);
    }

    res.status(200).json({
      success: true,
      message: 'Demo stopped',
    });
  } catch (error) {
    console.error('[Users] Error stopping demo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop demo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
