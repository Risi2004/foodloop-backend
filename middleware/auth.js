const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Middleware to authenticate admin users
 * Verifies JWT token and checks if user role is 'Admin'
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authentication required.',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify token
      const decoded = verifyToken(token);

      // Check if user is admin
      if (decoded.role !== 'Admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.',
        });
      }

      // Attach user info to request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
      };

      next();
    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
    });
  }
};

/**
 * Middleware to authenticate any user (Donor, Receiver, Driver, Admin)
 * Verifies JWT token, checks user status, and attaches user info to request
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authentication required.',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify token
      const decoded = verifyToken(token);

      // Skip status check for static admin
      if (decoded.id === 'admin_static_id' && decoded.role === 'Admin') {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
        };
        return next();
      }

      // For everyone else: fetch user and check status
      const user = await User.findById(decoded.id).select('status email role').lean();
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }
      if (user.status !== 'completed') {
        return res.status(403).json({
          success: false,
          message: 'Account deactivated',
          status: user.status,
        });
      }

      // Attach user info to request
      req.user = {
        id: decoded.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
  } catch (error) {
    console.error('User authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
    });
  }
};

module.exports = { authenticateAdmin, authenticateUser };
