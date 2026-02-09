// Load and validate environment variables
require('./config/env');

const http = require('http');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const cron = require('node-cron');
const { PORT, NODE_ENV } = require('./config/env');
const connectDB = require('./config/database');
const { verifyToken } = require('./utils/jwt');
const Donation = require('./models/Donation');
const socketService = require('./services/socketService');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const contactRoutes = require('./routes/contact');
const donationRoutes = require('./routes/donations');
const userRoutes = require('./routes/users');
const reviewRoutes = require('./routes/reviews');
const notificationRoutes = require('./routes/notifications');
const chatRoutes = require('./routes/chat');
const mapRoutes = require('./routes/map');
const publicRoutes = require('./routes/public');
const {
  checkAndDeleteExpiredDonations,
  sendExpiryWarningEmails,
} = require('./services/expiredDonationService');

const app = express();

// Trust proxy so req.ip reflects client IP when behind reverse proxy (e.g. Nginx, Render)
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
// Note: Body parsers are NOT applied globally to avoid conflicts with multer
// They will be applied per-route as needed

// Health check route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Auth routes (multer is applied in the route file for signup)
app.use('/api/auth', authRoutes);

// Admin routes (protected by admin authentication middleware)
app.use('/api/admin', adminRoutes);

// Contact form (public submit)
app.use('/api/contact', contactRoutes);

// Donation routes (for image upload and AI analysis)
app.use('/api/donations', donationRoutes);

// User routes (for user profile updates)
app.use('/api/users', userRoutes);

// Review routes (for review submission and management)
app.use('/api/reviews', reviewRoutes);

// Notification routes (authenticated users; role-filtered list)
app.use('/api/notifications', notificationRoutes);

// Chat route (proxy to AI service; no auth so chatbot works on landing page)
app.use('/api/chat', chatRoutes);

// Map locations (public; for landing page map)
app.use('/api/map', mapRoutes);

// Public stats (landing page; no auth)
app.use('/api/public', publicRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'file', message: 'File too large. Maximum size is 10MB' }],
      });
    }
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Set up scheduled jobs for expired donation handling
// Run deletion check every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('[Scheduler] Running expired donation deletion check...');
  try {
    const result = await checkAndDeleteExpiredDonations();
    console.log(`[Scheduler] Deletion check completed: ${result.deleted} deleted, ${result.errors} errors`);
  } catch (error) {
    console.error('[Scheduler] Error in expired donation deletion check:', error);
  }
});

// Run expiry warning check every hour (at minute 0)
cron.schedule('0 * * * *', async () => {
  console.log('[Scheduler] Running expiry warning email check...');
  try {
    const result = await sendExpiryWarningEmails();
    console.log(`[Scheduler] Warning email check completed: ${result.sent} sent, ${result.errors} errors`);
  } catch (error) {
    console.error('[Scheduler] Error in expiry warning email check:', error);
  }
});

console.log('✅ Scheduled jobs initialized:');
console.log('   - Expired donation deletion: Every 30 minutes');
console.log('   - Expiry warning emails: Every hour');

// HTTP server for Express + Socket.IO
const server = http.createServer(app);

// Socket.IO: real-time driver location to donor/receiver
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('No token'));
  }
  try {
    const decoded = verifyToken(token);
    socket.userId = decoded.id?.toString();
    socket.role = decoded.role;
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  // Join user room so we can emit to this user (e.g. account_deactivated)
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }
  // Join role room so we can emit to all receivers/drivers/donors (e.g. donation_created)
  if (socket.role) {
    socket.join(`role:${socket.role}`);
  }

  socket.on('join_donation', async (donationId, callback) => {
    if (!donationId || typeof donationId !== 'string') {
      callback?.({ success: false, message: 'Invalid donation ID' });
      return;
    }
    try {
      const donation = await Donation.findById(donationId).select('donorId assignedReceiverId').lean();
      if (!donation) {
        callback?.({ success: false, message: 'Donation not found' });
        return;
      }
      const userId = socket.userId;
      const isDonor = donation.donorId?.toString() === userId;
      const isReceiver = donation.assignedReceiverId?.toString() === userId;
      if (!isDonor && !isReceiver) {
        callback?.({ success: false, message: 'Not authorized to track this donation' });
        return;
      }
      socket.join(`donation:${donationId}`);
      callback?.({ success: true });
    } catch (err) {
      console.error('[Socket] join_donation error:', err);
      callback?.({ success: false, message: 'Server error' });
    }
  });

  socket.on('leave_donation', (donationId) => {
    if (donationId && typeof donationId === 'string') {
      socket.leave(`donation:${donationId}`);
    }
  });
});

socketService.setIO(io);

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📝 Environment: ${NODE_ENV}`);
  console.log('📡 Socket.IO enabled for real-time tracking');
});
