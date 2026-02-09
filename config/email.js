const nodemailer = require('nodemailer');

// Email configuration from environment variables
// These are optional - if not set, email functionality will be disabled
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT) || 587;
const EMAIL_USER = process.env.EMAIL_USER || 'foodloop.official27@gmail.com';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || 'FoodLoop <foodloop.official27@gmail.com>';

// Check if email is configured
const isEmailConfigured = () => {
  return !!(EMAIL_PASSWORD && EMAIL_USER);
};

// Create transporter
let transporter = null;

if (isEmailConfigured()) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
  });

  // Verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email configuration error:', error.message);
      console.error('   Email notifications will be disabled.');
    } else {
      console.log('✅ Email service is ready');
    }
  });
} else {
  console.warn('⚠️  Email not configured. EMAIL_PASSWORD is missing.');
  console.warn('   Email notifications will be disabled.');
  console.warn('   To enable: Set EMAIL_PASSWORD in .env file with Gmail app password');
}

module.exports = {
  transporter,
  isEmailConfigured,
  EMAIL_FROM,
  EMAIL_USER,
};
