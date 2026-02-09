const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { uploadFileToS3 } = require('../config/awsS3');
const { handleFileUpload } = require('../middleware/upload');
const { generateToken, verifyToken } = require('../utils/jwt');
const {
  sendWelcomeEmail,
  sendPendingApprovalEmail,
  sendAdminLoginNotificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} = require('../utils/emailService');
const {
  donorIndividualValidation,
  donorBusinessValidation,
  receiverValidation,
  driverValidation,
  handleValidationErrors,
} = require('../middleware/validation');
const { authenticateUser } = require('../middleware/auth');

// Helper function to upload files to S3
const uploadFiles = async (files) => {
  const uploadedFiles = {};

  if (files.profileImage && files.profileImage[0]) {
    uploadedFiles.profileImageUrl = await uploadFileToS3(files.profileImage[0], 'profile-images');
  }

  if (files.businessRegFile && files.businessRegFile[0]) {
    uploadedFiles.businessRegFileUrl = await uploadFileToS3(files.businessRegFile[0], 'business-registration');
  }

  if (files.addressProofFile && files.addressProofFile[0]) {
    uploadedFiles.addressProofFileUrl = await uploadFileToS3(files.addressProofFile[0], 'address-proof');
  }

  if (files.nicFile && files.nicFile[0]) {
    uploadedFiles.nicFileUrl = await uploadFileToS3(files.nicFile[0], 'nic');
  }

  if (files.licenseFile && files.licenseFile[0]) {
    uploadedFiles.licenseFileUrl = await uploadFileToS3(files.licenseFile[0], 'license');
  }

  return uploadedFiles;
};

// Signup route - apply multer middleware for file uploads
router.post('/signup', handleFileUpload, async (req, res) => {
  try {
    // Debug logging
    console.log('Signup request received');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body keys:', Object.keys(req.body || {}));
    console.log('Files keys:', Object.keys(req.files || {}));
    
    const { role, donorType, password, retypePassword } = req.body;

    // Validate password match
    if (password !== retypePassword) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'retypePassword', message: 'Passwords do not match' }],
      });
    }

    // Check if email already exists
    const email = req.body.email?.toLowerCase().trim();
    if (!email) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'email', message: 'Email is required' }],
      });
    }
    
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      console.log(`Email conflict: ${email} already exists for user with role: ${existingUser.role}`);
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
        errors: [{ field: 'email', message: 'This email is already registered. Please use a different email or try logging in.' }],
      });
    }

    // Check if username already exists (for individual donors)
    if (role === 'Donor' && donorType === 'Individual' && req.body.username) {
      const existingUsername = await User.findOne({ username: req.body.username });
      if (existingUsername) {
        return res.status(409).json({
          success: false,
          errors: [{ field: 'username', message: 'Username already exists' }],
        });
      }
    }

    // Upload files to S3
    let uploadedFiles = {};
    if (req.files) {
      try {
        uploadedFiles = await uploadFiles(req.files);
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        return res.status(500).json({
          success: false,
          errors: [{ 
            field: 'files', 
            message: uploadError.message || 'Failed to upload files. Please check your AWS S3 configuration.' 
          }],
        });
      }
    }

    // Create user object based on role
    const userData = {
      email: email, // Use normalized email
      password: req.body.password,
      role: role,
      contactNo: req.body.contactNo,
      address: req.body.address,
      ...uploadedFiles,
    };

    // Set status based on role and donor type
    // Individual Donor: status = 'completed'
    // All others (Business Donor, Driver, Receiver): status = 'pending'
    if (role === 'Donor' && donorType === 'Individual') {
      userData.status = 'completed';
    } else {
      userData.status = 'pending';
    }

    // Add role-specific fields
    if (role === 'Donor') {
      userData.donorType = donorType;
      if (donorType === 'Individual') {
        // Only set username for Individual Donors
        if (req.body.username) {
          userData.username = req.body.username.trim();
        }
      } else if (donorType === 'Business') {
        userData.businessName = req.body.businessName;
        userData.businessType = req.body.businessType;
        // Explicitly don't set username for Business Donors (leave it undefined)
        // This prevents the unique constraint issue with null values
      }
    } else if (role === 'Receiver') {
      userData.receiverName = req.body.receiverName;
      userData.receiverType = req.body.receiverType;
      // Don't set username for Receivers
    } else if (role === 'Driver') {
      userData.driverName = req.body.driverName;
      userData.vehicleNumber = req.body.vehicleNumber;
      userData.vehicleType = req.body.vehicleType;
      // Don't set username for Drivers
    }

    // Create user
    const user = new User(userData);
    await user.save();

    // Send appropriate email based on role and status
    try {
      if (role === 'Donor' && donorType === 'Individual') {
        // Individual Donor - account is immediately active
        await sendWelcomeEmail(user);
      } else {
        // Business Donor, Receiver, or Driver - needs admin approval
        await sendPendingApprovalEmail(user);
      }
    } catch (emailError) {
      // Log email error but don't fail signup
      console.error('Email sending error (signup):', emailError.message);
    }

    // Return success (don't return password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: userResponse,
    });
  } catch (error) {
    console.error('Signup error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Request files:', req.files ? Object.keys(req.files) : 'No files');
    
    // Handle duplicate key errors (MongoDB unique constraint violations)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = `${field} already exists`;
      
      // Provide more user-friendly messages
      if (field === 'email') {
        message = 'This email is already registered. Please use a different email.';
      } else if (field === 'username') {
        message = 'This username is already taken. Please choose a different username.';
      }
      
      console.error(`Duplicate key error for field: ${field}`, error.keyValue);
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry',
        errors: [{ field: field, message: message }],
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
      }));
      return res.status(400).json({
        success: false,
        errors: errors,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Login route
router.post('/login', express.json(), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'email', message: 'Email/username and password are required' }],
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for static admin credentials first
    const ADMIN_EMAIL = 'foodloop.official27@gmail.com';
    const ADMIN_PASSWORD = 'admin123';

    if (normalizedEmail === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      // Create virtual admin user object
      const adminUser = {
        _id: 'admin_static_id',
        email: ADMIN_EMAIL,
        role: 'Admin',
        status: 'completed',
        contactNo: 'N/A',
        address: 'N/A',
      };

      // Generate JWT token for admin
      const token = generateToken(adminUser);

      // Fire-and-forget: send admin login notification email (time, location, device)
      const time = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'medium' });
      const device = (req.headers['user-agent'] || 'Unknown').slice(0, 200);
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'Unknown';
      const isLocalIp = /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test((ip || '').trim());
      (async () => {
        let location;
        if (isLocalIp) {
          location = `Localhost / this device (no geographic location) – IP: ${ip}`;
        } else {
          location = `IP: ${ip}`;
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const geoRes = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=city,country,regionName`, { signal: controller.signal });
            clearTimeout(timeoutId);
            const j = await geoRes.json();
            if (j && (j.city || j.country)) {
              const parts = [j.city, j.regionName, j.country].filter(Boolean);
              location = `${parts.join(', ')} (IP: ${ip})`;
            }
          } catch (_) {}
        }
        try {
          await sendAdminLoginNotificationEmail(ADMIN_EMAIL, { time, location, device });
        } catch (e) {
          console.error('[Auth] Admin login notification email error:', e);
        }
      })();

      // Return admin user response
      res.status(200).json({
        success: true,
        message: 'Login successful',
        token: token,
        user: adminUser,
      });
      return;
    }

    // Find user by email or username
    // Try email first (normalized to lowercase)
    let user = await User.findOne({ email: normalizedEmail });
    
    // If not found by email, try username (for Individual Donors)
    if (!user) {
      user = await User.findOne({ username: email.trim() });
    }

    // If user not found
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: [{ field: 'email', message: 'Invalid email/username or password' }],
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        errors: [{ field: 'password', message: 'Invalid email/username or password' }],
      });
    }

    // Check user status
    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. Please wait for approval before logging in.',
        errors: [{ field: 'status', message: 'Account pending admin approval' }],
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been rejected. Please contact support for assistance.',
        errors: [{ field: 'status', message: 'Account rejected' }],
      });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Contact an administrator to reactivate.',
        errors: [{ field: 'status', message: 'Account deactivated' }],
      });
    }

    // Status is 'completed' - allow login
    // Generate JWT token
    const token = generateToken(user);

    // If admin, fire-and-forget: send admin login notification email
    if (user.role === 'Admin') {
      const time = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'medium' });
      const device = (req.headers['user-agent'] || 'Unknown').slice(0, 200);
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'Unknown';
      const isLocalIp = /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test((ip || '').trim());
      (async () => {
        let location;
        if (isLocalIp) {
          location = `Localhost / this device (no geographic location) – IP: ${ip}`;
        } else {
          location = `IP: ${ip}`;
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const geoRes = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=city,country,regionName`, { signal: controller.signal });
            clearTimeout(timeoutId);
            const j = await geoRes.json();
            if (j && (j.city || j.country)) {
              const parts = [j.city, j.regionName, j.country].filter(Boolean);
              location = `${parts.join(', ')} (IP: ${ip})`;
            }
          } catch (_) {}
        }
        try {
          await sendAdminLoginNotificationEmail(user.email, { time, location, device });
        } catch (e) {
          console.error('[Auth] Admin login notification email error:', e);
        }
      })();
    }

    // Prepare user response (without password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      user: userResponse,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset; send reset link by email if user exists (always return same message)
 */
router.post('/forgot-password', express.json(), async (req, res) => {
  try {
    const { email } = req.body;
    const genericMessage = 'If an account exists for this email, you will receive a password reset link.';

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetToken = token;
      user.resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour
      await user.save();

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetLink = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

      (async () => {
        try {
          await sendPasswordResetEmail(user.email, resetLink);
        } catch (e) {
          console.error('[Auth] Forgot password email error:', e);
        }
      })();
    }

    res.status(200).json({
      success: true,
      message: genericMessage,
    });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token from email link
 */
router.post('/reset-password', express.json(), async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is required',
      });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password is required and must be at least 6 characters',
      });
    }

    const user = await User.findOne({
      resetToken: token.trim(),
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link.',
      });
    }

    user.password = newPassword.trim();
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    (async () => {
      try {
        await sendPasswordChangedEmail(user.email);
      } catch (e) {
        console.error('[Auth] Password changed email error:', e);
      }
    })();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in.',
    });
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user (current + new password).
 * Updates DB and sends "password changed" email.
 */
router.post('/change-password', express.json(), authenticateUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || typeof currentPassword !== 'string' || !currentPassword.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Current password is required',
      });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const isMatch = await user.comparePassword(currentPassword.trim());
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword.trim();
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    (async () => {
      try {
        await sendPasswordChangedEmail(user.email);
      } catch (e) {
        console.error('[Auth] Password changed email error:', e);
      }
    })();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. A confirmation email has been sent.',
    });
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Token verification route
router.get('/verify', express.json(), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = verifyToken(token);
      
      // Handle admin user (static credentials)
      if (decoded.id === 'admin_static_id' && decoded.role === 'Admin') {
        const adminUser = {
          _id: 'admin_static_id',
          email: 'foodloop.official27@gmail.com',
          role: 'Admin',
          status: 'completed',
          contactNo: 'N/A',
          address: 'N/A',
        };

        return res.status(200).json({
          success: true,
          user: adminUser,
        });
      }
      
      // Find user to get latest data
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check user status
      if (user.status !== 'completed') {
        return res.status(403).json({
          success: false,
          message: 'Account not approved',
          status: user.status,
        });
      }

      // Return user data
      const userResponse = user.toObject();
      delete userResponse.password;

      res.status(200).json({
        success: true,
        user: userResponse,
      });
    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

module.exports = router;
