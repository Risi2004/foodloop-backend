const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ImpactReceipt = require('../models/ImpactReceipt');
const Donation = require('../models/Donation');

router.use(express.json());

/**
 * GET /api/public/stats
 * Public landing page stats: donor/driver/receiver counts and impact aggregates (no auth).
 */
router.get('/stats', async (req, res) => {
  try {
    const [donors, drivers, receivers, impact] = await Promise.all([
      User.countDocuments({ role: 'Donor', status: 'completed' }),
      User.countDocuments({ role: 'Driver', status: 'completed' }),
      User.countDocuments({ role: 'Receiver', status: 'completed' }),
      ImpactReceipt.aggregate([
        {
          $lookup: {
            from: 'donations',
            localField: 'donationId',
            foreignField: '_id',
            as: 'donation',
          },
        },
        { $unwind: { path: '$donation', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: null,
            foodSavedKg: {
              $sum: { $multiply: ['$donation.quantity', '$weightPerServing'] },
            },
            peopleFed: { $sum: '$peopleFed' },
            methaneSavedKg: { $sum: '$methaneSaved' },
          },
        },
      ]),
    ]);

    const impactResult = impact[0] || {
      foodSavedKg: 0,
      peopleFed: 0,
      methaneSavedKg: 0,
    };

    res.status(200).json({
      success: true,
      stats: {
        donors,
        drivers,
        receivers,
        foodSavedKg: Math.round(impactResult.foodSavedKg || 0),
        peopleFed: impactResult.peopleFed || 0,
        methaneSavedKg: impactResult.methaneSavedKg || 0,
      },
    });
  } catch (error) {
    console.error('[Public] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
