const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const Donation = require('../models/Donation');
const DonationMessage = require('../models/DonationMessage');
const User = require('../models/User');
const socketService = require('../services/socketService');

router.use(express.json());

/**
 * Helper: ensure current user is a participant of the donation (donor, assigned receiver, or assigned driver).
 * Returns donation doc or sends 403/404 and returns null.
 */
async function ensureParticipant(req, res) {
  const donationId = req.params.donationId;
  const userId = req.user?.id;
  if (!donationId || !userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return null;
  }
  const donation = await Donation.findById(donationId)
    .select('donorId assignedReceiverId assignedDriverId')
    .lean();
  if (!donation) {
    res.status(404).json({ success: false, message: 'Donation not found' });
    return null;
  }
  const idStr = userId.toString();
  const isDonor = donation.donorId?.toString() === idStr;
  const isReceiver = donation.assignedReceiverId?.toString() === idStr;
  const isDriver = donation.assignedDriverId?.toString() === idStr;
  if (!isDonor && !isReceiver && !isDriver) {
    res.status(403).json({ success: false, message: 'You are not a participant of this donation' });
    return null;
  }
  return donation;
}

function getSenderDisplayName(user) {
  if (!user) return 'Unknown';
  if (user.role === 'Driver') return user.driverName || 'Driver';
  if (user.role === 'Receiver') return user.receiverName || 'Receiver';
  if (user.role === 'Donor') {
    if (user.donorType === 'Business') return user.businessName || 'Donor';
    return user.username || 'Donor';
  }
  return user.email || 'Unknown';
}

/**
 * GET /api/donations/:donationId/chat
 * List messages for this donation (participants only).
 */
router.get('/:donationId/chat', authenticateUser, async (req, res) => {
  try {
    const donation = await ensureParticipant(req, res);
    if (!donation) return;

    const donationId = req.params.donationId;
    const messages = await DonationMessage.find({ donationId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'username driverName receiverName role donorType businessName email')
      .lean();

    const list = messages.map((m) => {
      const sender = m.senderId;
      const senderName = sender ? getSenderDisplayName(sender) : 'Unknown';
      return {
        id: m._id.toString(),
        senderId: m.senderId?._id?.toString(),
        senderName,
        text: m.text,
        createdAt: m.createdAt,
      };
    });

    res.json({ success: true, messages: list });
  } catch (err) {
    console.error('[DonationChat] GET chat error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to load chat',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * POST /api/donations/:donationId/chat
 * Send a message (participants only). Emits donation_chat_message to donation room for real-time updates.
 */
router.post('/:donationId/chat', authenticateUser, async (req, res) => {
  try {
    const donation = await ensureParticipant(req, res);
    if (!donation) return;

    const donationId = req.params.donationId;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const msg = new DonationMessage({
      donationId,
      senderId: req.user.id,
      text,
    });
    await msg.save();
    await msg.populate('senderId', 'username driverName receiverName role donorType businessName email');

    const sender = msg.senderId;
    const senderName = sender ? getSenderDisplayName(sender) : 'Unknown';
    const payload = {
      id: msg._id.toString(),
      senderId: msg.senderId?._id?.toString(),
      senderName,
      text: msg.text,
      createdAt: msg.createdAt,
    };

    socketService.emitToDonationRoom(donationId, 'donation_chat_message', payload);

    res.status(201).json({ success: true, message: payload });
  } catch (err) {
    console.error('[DonationChat] POST chat error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

module.exports = router;
