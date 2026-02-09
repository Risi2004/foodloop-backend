const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const Review = require('../models/Review');
const User = require('../models/User');
const UserNotification = require('../models/UserNotification');
const { getUserDisplayName } = require('../utils/emailService');
const {
  sendReviewSubmittedEmail,
  sendReviewApprovedEmail,
  sendReviewRejectedEmail,
} = require('../utils/emailService');

// Apply JSON body parser middleware for all routes
router.use(express.json());

/**
 * POST /api/reviews/submit
 * Submit a review
 * Requires authentication (all roles)
 */
router.post('/submit', authenticateUser, async (req, res) => {
  try {
    const { reviewText } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate review text
    if (!reviewText || typeof reviewText !== 'string' || reviewText.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Review text is required',
      });
    }

    if (reviewText.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Review text must be 500 characters or less',
      });
    }

    // Get user to get display name
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get user display name
    const userName = getUserDisplayName(user);

    // Create review
    const review = new Review({
      userId: userId,
      userRole: userRole,
      userName: userName,
      reviewText: reviewText.trim(),
      status: 'pending',
    });

    await review.save();

    console.log(`[Reviews] Review submitted by ${userRole} ${userName} (${userId})`);

    // Send email notification (async, don't block response)
    (async () => {
      try {
        await sendReviewSubmittedEmail(user, review);
      } catch (emailError) {
        console.error('[Reviews] Error sending review submitted email:', emailError);
        // Don't fail review creation if email fails
      }
    })();

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully. It is under admin review.',
      review: {
        id: review._id.toString(),
        reviewText: review.reviewText,
        status: review.status,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    console.error('[Reviews] Error submitting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/reviews/approved
 * Get all approved reviews (public endpoint)
 */
router.get('/approved', async (req, res) => {
  try {
    const reviews = await Review.find({ status: 'approved' })
      .sort({ createdAt: -1 })
      .lean();

    // Format reviews for frontend
    const formattedReviews = reviews.map(review => ({
      id: review._id.toString(),
      name: review.userName,
      role: review.userRole.toUpperCase(),
      text: review.reviewText,
    }));

    console.log(`[Reviews] Returning ${formattedReviews.length} approved reviews`);

    res.status(200).json({
      success: true,
      reviews: formattedReviews,
      count: formattedReviews.length,
    });
  } catch (error) {
    console.error('[Reviews] Error fetching approved reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/reviews/pending
 * Get pending reviews for admin approval
 * Requires authentication (Admin role)
 */
router.get('/pending', authenticateUser, async (req, res) => {
  try {
    // Check if user is Admin
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can view pending reviews',
      });
    }

    const reviews = await Review.find({ status: 'pending' })
      .populate('userId', 'email donorType receiverType')
      .sort({ createdAt: -1 })
      .lean();

    // Format reviews for admin
    const formattedReviews = reviews.map(review => {
      // Get organization/type info
      let organization = review.userRole;
      if (review.userRole === 'Donor' && review.userId) {
        organization = review.userId.donorType || 'Individual';
      } else if (review.userRole === 'Receiver' && review.userId) {
        organization = review.userId.receiverType || 'NGO';
      }
      
      return {
        id: review._id.toString(),
        name: review.userName,
        date: new Date(review.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        role: review.userRole,
        organization: organization,
        reviewText: review.reviewText,
        userId: review.userId?._id?.toString(),
        userEmail: review.userId?.email,
        createdAt: review.createdAt,
      };
    });

    console.log(`[Reviews] Returning ${formattedReviews.length} pending reviews for admin`);

    res.status(200).json({
      success: true,
      reviews: formattedReviews,
      count: formattedReviews.length,
    });
  } catch (error) {
    console.error('[Reviews] Error fetching pending reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending reviews',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/reviews/:id/approve
 * Approve a review
 * Requires authentication (Admin role)
 */
router.post('/:id/approve', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Check if user is Admin
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can approve reviews',
      });
    }

    // Find the review with populated user
    const review = await Review.findById(id).populate('userId').lean();
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Review is already ${review.status}`,
      });
    }

    // Update review status
    // Handle static admin ID (not a valid ObjectId)
    const updateData = {
      status: 'approved',
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Only set approvedBy if it's a valid ObjectId (not static admin)
    if (adminId && adminId !== 'admin_static_id' && adminId.match(/^[0-9a-fA-F]{24}$/)) {
      updateData.approvedBy = adminId;
    }
    // For static admin, leave approvedBy as null/undefined
    
    await Review.findByIdAndUpdate(id, updateData);

    console.log(`[Reviews] Review ${id} approved by admin ${adminId}`);

    // Send email notification (async)
    (async () => {
      try {
        if (review.userId && review.userId.email) {
          // Ensure user has role for email function
          const userForEmail = { ...review.userId };
          if (!userForEmail.role) {
            userForEmail.role = review.userRole;
          }
          await sendReviewApprovedEmail(userForEmail, { ...review, _id: id });
        }
      } catch (emailError) {
        console.error('[Reviews] Error sending review approved email:', emailError);
        // Don't fail approval if email fails
      }
    })();

    // In-app notification for the reviewer (always a registered user)
    try {
      const reviewerId = review.userId && (review.userId._id || review.userId);
      if (reviewerId) {
        const userNotification = new UserNotification({
          user: reviewerId,
          title: 'Review approved',
          message: 'Your review has been approved and is now visible on FoodLoop.',
        });
        await userNotification.save();
      }
    } catch (notifError) {
      console.error('[Reviews] Error creating user notification for review approval:', notifError);
    }

    res.status(200).json({
      success: true,
      message: 'Review approved successfully',
    });
  } catch (error) {
    console.error('[Reviews] Error approving review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/reviews/:id/reject
 * Reject a review
 * Requires authentication (Admin role)
 */
router.post('/:id/reject', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    // Check if user is Admin
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can reject reviews',
      });
    }

    // Find the review with populated user
    const review = await Review.findById(id).populate('userId').lean();
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Review is already ${review.status}`,
      });
    }

    const rejectionReason = reason || 'Review did not meet our guidelines';

    // Update review status
    // Handle static admin ID (not a valid ObjectId)
    const updateData = {
      status: 'rejected',
      rejectedAt: Date.now(),
      rejectionReason: rejectionReason,
      updatedAt: Date.now(),
    };
    
    // Only set approvedBy if it's a valid ObjectId (not static admin)
    if (adminId && adminId !== 'admin_static_id' && adminId.match(/^[0-9a-fA-F]{24}$/)) {
      updateData.approvedBy = adminId;
    }
    // For static admin, leave approvedBy as null/undefined
    
    await Review.findByIdAndUpdate(id, updateData);

    console.log(`[Reviews] Review ${id} rejected by admin ${adminId}`);

    // Send email notification (async)
    (async () => {
      try {
        if (review.userId && review.userId.email) {
          // Ensure user has role for email function
          const userForEmail = { ...review.userId };
          if (!userForEmail.role) {
            userForEmail.role = review.userRole;
          }
          await sendReviewRejectedEmail(userForEmail, { ...review, _id: id }, rejectionReason);
        }
      } catch (emailError) {
        console.error('[Reviews] Error sending review rejected email:', emailError);
        // Don't fail rejection if email fails
      }
    })();

    res.status(200).json({
      success: true,
      message: 'Review rejected successfully',
    });
  } catch (error) {
    console.error('[Reviews] Error rejecting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
