const express = require('express');
const router = express.Router();
const ContactMessage = require('../models/ContactMessage');
const { sendContactConfirmationEmail } = require('../utils/emailService');
const { verifyToken } = require('../utils/jwt');

router.use(express.json());

/**
 * POST /api/contact
 * Submit a contact message (public; optional auth to associate userId)
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, contactNo, subject, message } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }

    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(authHeader.substring(7));
        if (decoded && decoded.id) userId = decoded.id;
      } catch (_) {
        // Invalid or expired token; proceed as guest
      }
    }

    const contactMessage = new ContactMessage({
      userId: userId || undefined,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      contactNo: contactNo ? String(contactNo).trim() : undefined,
      subject: subject ? String(subject).trim() : undefined,
      message: message.trim(),
    });

    await contactMessage.save();

    try {
      await sendContactConfirmationEmail(contactMessage.email, contactMessage.name);
    } catch (emailError) {
      console.error('[Contact] Error sending confirmation email:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      id: contactMessage._id.toString(),
    });
  } catch (error) {
    console.error('[Contact] Error submitting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
