const { transporter, isEmailConfigured, EMAIL_FROM } = require('../config/email');

/**
 * Get user display name based on role
 */
const getUserDisplayName = (user) => {
  if (user.role === 'Donor') {
    if (user.donorType === 'Business') {
      return user.businessName || user.email;
    } else {
      return user.username || user.email;
    }
  } else if (user.role === 'Receiver') {
    return user.receiverName || user.email;
  } else if (user.role === 'Driver') {
    return user.driverName || user.email;
  }
  return user.email;
};

/**
 * Send welcome email to Individual Donors
 * (Account is immediately active)
 */
const sendWelcomeEmail = async (user) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping welcome email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Welcome to FoodLoop! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .button {
              display: inline-block;
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Welcome to FoodLoop!</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <p>Thank you for joining FoodLoop! We're excited to have you as part of our community.</p>
            <p>Your account has been successfully created and is <strong>ready to use</strong>. You can now:</p>
            <ul>
              <li>Start donating food to help reduce waste</li>
              <li>Connect with receivers in your area</li>
              <li>Make a positive impact in your community</li>
            </ul>
            <p>You can log in to your account and start using FoodLoop right away!</p>
            <p>If you have any questions, feel free to reach out to us.</p>
            <p>Best regards,<br>The FoodLoop Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} FoodLoop. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending welcome email to ${user.email}:`, error.message);
    // Don't throw error - email failure shouldn't break signup
  }
};

/**
 * Send pending approval email to Business Donors, Receivers, and Drivers
 * (Account needs admin approval)
 */
const sendPendingApprovalEmail = async (user) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping pending approval email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);
    const roleDisplay = user.role === 'Donor' && user.donorType === 'Business' 
      ? 'Business Donor' 
      : user.role;
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Your FoodLoop Registration is Under Review',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .info-box {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Registration Received</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <p>Thank you for registering with FoodLoop as a <strong>${roleDisplay}</strong>!</p>
            <div class="info-box">
              <p><strong>Your registration is currently under review.</strong></p>
              <p>Our admin team will carefully review all the information and documents you've submitted. This process typically takes 1-2 business days.</p>
            </div>
            <p>Once your account is approved, you will receive an email notification and will be able to log in and start using FoodLoop.</p>
            <p>We appreciate your patience during this review process.</p>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p>Best regards,<br>The FoodLoop Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} FoodLoop. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Pending approval email sent to ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending pending approval email to ${user.email}:`, error.message);
    // Don't throw error - email failure shouldn't break signup
  }
};

/**
 * Send approval confirmation email
 * (Account has been approved by admin)
 */
const sendApprovalEmail = async (user) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping approval email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);
    const roleDisplay = user.role === 'Donor' && user.donorType === 'Business' 
      ? 'Business Donor' 
      : user.role;
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Your FoodLoop Account Has Been Approved! ✅',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .success-box {
              background: #d4edda;
              border-left: 4px solid #28a745;
              padding: 15px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Account Approved! 🎉</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <div class="success-box">
              <p><strong>Great news! Your FoodLoop account has been approved.</strong></p>
              <p>You can now log in and start using FoodLoop as a ${roleDisplay}.</p>
            </div>
            <p>Your account is now active and ready to use. You can:</p>
            <ul>
              ${user.role === 'Donor' ? '<li>Start donating food items</li>' : ''}
              ${user.role === 'Receiver' ? '<li>Browse available food donations</li><li>Claim food items</li>' : ''}
              ${user.role === 'Driver' ? '<li>View available pickup requests</li><li>Start delivering food</li>' : ''}
              <li>Access all features of your account</li>
            </ul>
            <p>We're excited to have you as part of the FoodLoop community!</p>
            <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
            <p>Best regards,<br>The FoodLoop Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} FoodLoop. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Approval email sent to ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending approval email to ${user.email}:`, error.message);
    // Don't throw error - email failure shouldn't break approval
  }
};

/**
 * Send rejection email (optional)
 */
const sendRejectionEmail = async (user) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping rejection email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'FoodLoop Registration Update',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .info-box {
              background: #f8d7da;
              border-left: 4px solid #dc3545;
              padding: 15px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Registration Update</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <p>Thank you for your interest in joining FoodLoop.</p>
            <div class="info-box">
              <p><strong>We regret to inform you that your FoodLoop registration could not be approved at this time.</strong></p>
              <p>After careful review of your submitted information and documents, we were unable to approve your account registration.</p>
            </div>
            <p>This decision may be due to:</p>
            <ul>
              <li>Incomplete or missing documentation</li>
              <li>Information that doesn't meet our verification requirements</li>
              <li>Other compliance-related factors</li>
            </ul>
            <p>If you believe this is an error or would like to discuss your registration further, please contact our support team at <strong>foodloop.official27@gmail.com</strong>.</p>
            <p>We appreciate your understanding and thank you for your interest in FoodLoop.</p>
            <p>Best regards,<br>The FoodLoop Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} FoodLoop. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Rejection email sent to ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending rejection email to ${user.email}:`, error.message);
  }
};

/**
 * Send account deactivation email
 */
const sendDeactivationEmail = async (user) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping deactivation email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Your FoodLoop Account Has Been Deactivated',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .info-box {
              background: #f8d7da;
              border-left: 4px solid #dc3545;
              padding: 15px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Account Deactivated</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <div class="info-box">
              <p><strong>Your FoodLoop account has been deactivated.</strong></p>
              <p>You will no longer be able to access your account or use FoodLoop services until your account is reactivated by an administrator.</p>
            </div>
            <p>If you believe this is an error or have any questions, please contact our support team at <strong>foodloop.official27@gmail.com</strong>.</p>
            <p>We apologize for any inconvenience this may cause.</p>
            <p>Best regards,<br>The FoodLoop Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} FoodLoop. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Deactivation email sent to ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending deactivation email to ${user.email}:`, error.message);
  }
};

/**
 * Send account activation/reactivation email
 */
const sendActivationEmail = async (user) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping activation email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);
    const roleDisplay = user.role === 'Donor' && user.donorType === 'Business' 
      ? 'Business Donor' 
      : user.role;
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Your FoodLoop Account Has Been Activated! ✅',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .success-box {
              background: #d4edda;
              border-left: 4px solid #28a745;
              padding: 15px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%);
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Account Activated! 🎉</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <div class="success-box">
              <p><strong>Great news! Your FoodLoop account has been activated.</strong></p>
              <p>You can now log in and start using FoodLoop as a ${roleDisplay}.</p>
            </div>
            <p>Your account is now active and ready to use. You can:</p>
            <ul>
              ${user.role === 'Donor' ? '<li>Start donating food items</li>' : ''}
              ${user.role === 'Receiver' ? '<li>Browse available food donations</li><li>Claim food items</li>' : ''}
              ${user.role === 'Driver' ? '<li>View available pickup requests</li><li>Start delivering food</li>' : ''}
              <li>Access all features of your account</li>
            </ul>
            <p>We're excited to have you back in the FoodLoop community!</p>
            <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
            <p>Best regards,<br>The FoodLoop Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} FoodLoop. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Activation email sent to ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending activation email to ${user.email}:`, error.message);
  }
};

/**
 * Send donation live confirmation email
 * Sent when a donation is successfully posted
 */
const sendDonationLiveEmail = async (donation, user) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping donation live email.');
    return;
  }

  try {
    const displayName = getUserDisplayName(user);
    const expiryDate = new Date(donation.expiryDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    const pickupDate = new Date(donation.preferredPickupDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: '🎉 Your Donation is Now Live!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Donation Live</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Your Donation is Live!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${displayName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! Your donation has been successfully posted and is now live on FoodLoop.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <h2 style="color: #10b981; margin-top: 0; font-size: 20px;">Donation Details</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tracking ID:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.trackingId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Item Name:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.itemName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Category:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.foodCategory}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Quantity:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Expiry Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${expiryDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${pickupDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Window:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.preferredPickupTimeFrom} - ${donation.preferredPickupTimeTo}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Status:</td>
                  <td style="padding: 8px 0; color: #10b981; font-weight: bold;">${donation.status.charAt(0).toUpperCase() + donation.status.slice(1)}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>📋 What's Next?</strong><br>
                Your donation is now visible to receivers. Once a receiver accepts your donation, a driver will be assigned for pickup.
                You can track the status of your donation using the tracking ID above.
              </p>
            </div>
            
            <p style="font-size: 16px; margin-top: 30px;">
              Thank you for your generous contribution to reducing food waste and helping those in need!
            </p>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Best regards,<br>
              <strong>The FoodLoop Team</strong>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Donation live email sent to ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending donation live email to ${user.email}:`, error.message);
    // Don't throw error - email failure shouldn't break donation creation
  }
};

/**
 * Send new donation notification email to a single receiver
 * @param {Object} donation - Donation object
 * @param {Object} donor - Donor user object
 * @param {Object} receiver - Receiver user object
 */
const sendNewDonationNotificationToReceiver = async (donation, donor, receiver) => {
  if (!isEmailConfigured() || !transporter) {
    return;
  }

  try {
    const donorName = getUserDisplayName(donor);
    const receiverName = getUserDisplayName(receiver);
    const expiryDate = new Date(donation.expiryDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    const pickupDate = new Date(donation.preferredPickupDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const mailOptions = {
      from: EMAIL_FROM,
      to: receiver.email,
      subject: '🍽️ New Food Donation Available!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Donation Available</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🍽️ New Donation Available!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${receiverName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! A new food donation has been posted on FoodLoop and is now available for claiming.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <h2 style="color: #10b981; margin-top: 0; font-size: 20px;">Donation Details</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Item Name:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.itemName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Category:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.foodCategory}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Quantity:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Donor:</td>
                  <td style="padding: 8px 0; color: #111827;">${donorName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Location:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.donorAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Expiry Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${expiryDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${pickupDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Window:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.preferredPickupTimeFrom} - ${donation.preferredPickupTimeTo}</td>
                </tr>
                ${donation.aiQualityScore ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Quality Score:</td>
                  <td style="padding: 8px 0; color: #111827;">${(donation.aiQualityScore * 100).toFixed(0)}%</td>
                </tr>
                ` : ''}
                ${donation.aiFreshness ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Freshness:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.aiFreshness}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>⚡ Act Fast!</strong><br>
                This donation is available on a first-come, first-served basis. Log in to your FoodLoop account to claim it now!
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/receiver/find-food" 
                 style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View & Claim Donation
              </a>
            </div>
            
            <p style="font-size: 16px; margin-top: 30px;">
              Thank you for being part of the FoodLoop community and helping reduce food waste!
            </p>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Best regards,<br>
              <strong>The FoodLoop Team</strong>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ New donation notification email sent to receiver: ${receiver.email}`);
  } catch (error) {
    console.error(`❌ Error sending new donation notification email to ${receiver.email}:`, error.message);
    // Don't throw error - email failure shouldn't break the process
  }
};

/**
 * Send new donation notification emails to all registered receivers
 * @param {Object} donation - Donation object
 * @param {Object} donor - Donor user object
 */
const sendNewDonationNotificationToReceivers = async (donation, donor) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping new donation notification emails to receivers.');
    return;
  }

  try {
    // Import User model here to avoid circular dependencies
    const User = require('../models/User');
    
    // Fetch all receivers with status 'completed' (approved receivers)
    const receivers = await User.find({
      role: 'Receiver',
      status: 'completed',
    }).select('email receiverName');

    if (!receivers || receivers.length === 0) {
      console.log('[Donations] No approved receivers found. Skipping email notifications.');
      return;
    }

    console.log(`[Donations] Sending new donation notification to ${receivers.length} receiver(s)...`);

    // Send emails to all receivers asynchronously (don't wait for all to complete)
    // Use Promise.allSettled to handle individual failures gracefully
    const emailPromises = receivers.map(receiver => 
      sendNewDonationNotificationToReceiver(donation, donor, receiver)
    );

    const results = await Promise.allSettled(emailPromises);
    
    // Count successful and failed emails
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[Donations] Email notifications sent: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      console.warn(`[Donations] ${failed} email notification(s) failed, but donation was still created successfully.`);
    }
  } catch (error) {
    console.error('[Donations] Error sending new donation notifications to receivers:', error.message);
    // Don't throw error - email failure shouldn't break donation creation
  }
};

/**
 * Send donation available notification email to a single driver
 * Sent when a receiver claims a donation, notifying drivers that a pickup is available
 */
const sendDonationAvailableNotificationToDriver = async (donation, donor, receiver, driver) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping donation available notification email to driver.');
    return;
  }

  try {
    const driverName = driver?.driverName || driver?.email || 'Driver';
    const donorName = getUserDisplayName(donor);
    const receiverName = getUserDisplayName(receiver);
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: driver.email,
      subject: '🚚 New Pickup Available - FoodLoop Delivery',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .info-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #1b4332;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">🚚 New Pickup Available!</h1>
          </div>
          <div class="content">
            <p>Dear ${driverName},</p>
            
            <p>A new food donation pickup is now available for delivery!</p>
            
            <div class="info-box">
              <strong>Donation Details:</strong><br>
              <strong>Item:</strong> ${donation.itemName}<br>
              <strong>Quantity:</strong> ${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}<br>
              <strong>Tracking ID:</strong> ${donation.trackingId}<br>
              <strong>From:</strong> ${donorName}<br>
              <strong>To:</strong> ${receiverName}<br>
              <strong>Pickup Address:</strong> ${donation.donorAddress || 'See details in app'}
            </div>
            
            <p>Log in to your driver portal to view this pickup and accept the delivery.</p>
            
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/driver/delivery" class="button">
              View Available Pickups
            </a>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Donation available notification sent to driver: ${driver.email}`);
  } catch (error) {
    console.error(`❌ Error sending donation available notification to driver ${driver.email}:`, error.message);
    throw error; // Re-throw so Promise.allSettled can catch it
  }
};

/**
 * Send donation available notification emails to all active drivers
 * Sent when a receiver claims a donation
 */
const sendDonationAvailableNotificationToDrivers = async (donation, donor, receiver) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping donation available notification emails to drivers.');
    return;
  }

  try {
    // Import User model here to avoid circular dependencies
    const User = require('../models/User');
    
    // Fetch all drivers with status 'completed' (approved drivers)
    const drivers = await User.find({
      role: 'Driver',
      status: 'completed',
    }).select('email driverName');

    if (!drivers || drivers.length === 0) {
      console.log('[Donations] No approved drivers found. Skipping email notifications.');
      return;
    }

    console.log(`[Donations] Sending donation available notification to ${drivers.length} driver(s)...`);

    // Send emails to all drivers asynchronously (don't wait for all to complete)
    // Use Promise.allSettled to handle individual failures gracefully
    const emailPromises = drivers.map(driver => 
      sendDonationAvailableNotificationToDriver(donation, donor, receiver, driver)
    );

    const results = await Promise.allSettled(emailPromises);
    
    // Count successful and failed emails
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[Donations] Driver email notifications sent: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      console.warn(`[Donations] ${failed} driver email notification(s) failed, but donation was still claimed successfully.`);
    }
  } catch (error) {
    console.error('[Donations] Error sending donation available notifications to drivers:', error.message);
    // Don't throw error - email failure shouldn't break donation claim
  }
};

/**
 * Send donation claimed notification email to donor
 * Sent when a receiver claims their donation
 */
const sendDonationClaimedEmail = async (donation, donor, receiver) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping donation claimed email.');
    return;
  }

  try {
    const donorName = getUserDisplayName(donor);
    const receiverName = getUserDisplayName(receiver);
    const expiryDate = new Date(donation.expiryDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    const pickupDate = new Date(donation.preferredPickupDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const mailOptions = {
      from: EMAIL_FROM,
      to: donor.email,
      subject: '🎉 Your Donation Has Been Claimed!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Donation Claimed</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Your Donation Has Been Claimed!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${donorName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! Your food donation has been claimed by a receiver. A driver will be allocated soon to pick up the donation.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <h2 style="color: #10b981; margin-top: 0; font-size: 20px;">Donation Details</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tracking ID:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.trackingId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Item Name:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.itemName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Category:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.foodCategory}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Quantity:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Expiry Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${expiryDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${pickupDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Window:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.preferredPickupTimeFrom} - ${donation.preferredPickupTimeTo}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>📋 What's Next?</strong><br>
                Your donation has been claimed by <strong>${receiverName}</strong>. A driver will be allocated soon to pick up the donation from your location. You'll receive another notification once the driver is assigned.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/donor/my-donation" 
                 style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View My Donations
              </a>
            </div>
            
            <p style="font-size: 16px; margin-top: 30px;">
              Thank you for your generous contribution to reducing food waste and helping those in need!
            </p>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Best regards,<br>
              <strong>The FoodLoop Team</strong>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Donation claimed email sent to donor: ${donor.email}`);
  } catch (error) {
    console.error(`❌ Error sending donation claimed email to ${donor.email}:`, error.message);
    // Don't throw error - email failure shouldn't break the claim process
  }
};

/**
 * Send pickup confirmed email to donor
 * Sent when a driver confirms pickup of the donation
 */
const sendPickupConfirmedEmailToDonor = async (donation, donor, driver) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping pickup confirmed email to donor.');
    return;
  }

  try {
    const donorName = getUserDisplayName(donor);
    const driverName = getUserDisplayName(driver);
    const pickupDate = new Date(donation.preferredPickupDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const mailOptions = {
      from: EMAIL_FROM,
      to: donor.email,
      subject: '🚚 Driver Has Confirmed Pickup of Your Donation!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Pickup Confirmed</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🚚 Pickup Confirmed!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${donorName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! A driver has confirmed pickup of your donation. The driver will be arriving at your location soon to collect the food.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <h2 style="color: #3b82f6; margin-top: 0; font-size: 20px;">Donation Details</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tracking ID:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.trackingId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Item Name:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.itemName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Quantity:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${pickupDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Window:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.preferredPickupTimeFrom} - ${donation.preferredPickupTimeTo}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <h3 style="color: #3b82f6; margin-top: 0; font-size: 18px;">Driver Information</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Driver Name:</td>
                  <td style="padding: 8px 0; color: #111827;">${driverName}</td>
                </tr>
                ${driver.vehicleNumber ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Vehicle Number:</td>
                  <td style="padding: 8px 0; color: #111827;">${driver.vehicleNumber}</td>
                </tr>
                ` : ''}
                ${driver.vehicleType ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Vehicle Type:</td>
                  <td style="padding: 8px 0; color: #111827;">${driver.vehicleType}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>📋 What's Next?</strong><br>
                Please have your donation ready for pickup. The driver will arrive at your location during the specified pickup window. 
                You can track the delivery status from your dashboard.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/donor/my-donation" 
                 style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View My Donations
              </a>
            </div>
            
            <p style="font-size: 16px; margin-top: 30px;">
              Thank you for your generous contribution!
            </p>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Best regards,<br>
              <strong>The FoodLoop Team</strong>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Pickup confirmed email sent to donor: ${donor.email}`);
  } catch (error) {
    console.error(`❌ Error sending pickup confirmed email to donor ${donor.email}:`, error.message);
  }
};

/**
 * Send pickup confirmed email to receiver
 * Sent when a driver confirms pickup of the donation
 */
const sendPickupConfirmedEmailToReceiver = async (donation, receiver, driver) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping pickup confirmed email to receiver.');
    return;
  }

  try {
    const receiverName = getUserDisplayName(receiver);
    const driverName = getUserDisplayName(driver);
    const donorName = donation.donorName || 'Donor';
    const pickupDate = new Date(donation.preferredPickupDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const mailOptions = {
      from: EMAIL_FROM,
      to: receiver.email,
      subject: '🚚 Driver Has Confirmed Pickup - Your Food is on the Way!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Pickup Confirmed</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🚚 Pickup Confirmed!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${receiverName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! A driver has confirmed pickup of your claimed donation. Your food is now on the way to you!
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <h2 style="color: #10b981; margin-top: 0; font-size: 20px;">Donation Details</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tracking ID:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.trackingId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Item Name:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.itemName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Quantity:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">From Donor:</td>
                  <td style="padding: 8px 0; color: #111827;">${donorName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Date:</td>
                  <td style="padding: 8px 0; color: #111827;">${pickupDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Pickup Window:</td>
                  <td style="padding: 8px 0; color: #111827;">${donation.preferredPickupTimeFrom} - ${donation.preferredPickupTimeTo}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <h3 style="color: #3b82f6; margin-top: 0; font-size: 18px;">Driver Information</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Driver Name:</td>
                  <td style="padding: 8px 0; color: #111827;">${driverName}</td>
                </tr>
                ${driver.vehicleNumber ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Vehicle Number:</td>
                  <td style="padding: 8px 0; color: #111827;">${driver.vehicleNumber}</td>
                </tr>
                ` : ''}
                ${driver.vehicleType ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Vehicle Type:</td>
                  <td style="padding: 8px 0; color: #111827;">${driver.vehicleType}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div style="background: #d1fae5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <p style="margin: 0; color: #065f46; font-size: 14px;">
                <strong>📋 What's Next?</strong><br>
                The driver is now on the way to pick up your donation from the donor. You can track the delivery status in real-time from your dashboard. 
                The driver will deliver the food to your location soon.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/receiver/my-claims" 
                 style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Track My Claims
              </a>
            </div>
            
            <p style="font-size: 16px; margin-top: 30px;">
              Thank you for being part of the FoodLoop community!
            </p>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Best regards,<br>
              <strong>The FoodLoop Team</strong>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Pickup confirmed email sent to receiver: ${receiver.email}`);
  } catch (error) {
    console.error(`❌ Error sending pickup confirmed email to receiver ${receiver.email}:`, error.message);
  }
};

/**
 * Send delivery confirmed email to donor
 */
const sendDeliveryConfirmedEmailToDonor = async (donation, donor, receiver, driver) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping delivery confirmed email to donor.');
    return;
  }

  try {
    const donorName = getUserDisplayName(donor);
    const receiverName = getUserDisplayName(receiver);
    const driverName = driver?.driverName || 'Driver';
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: donor.email,
      subject: '✅ Your Donation Has Been Delivered Successfully!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .success-icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .info-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #1b4332;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="success-icon">✅</div>
            <h1 style="margin: 0;">Delivery Confirmed!</h1>
          </div>
          <div class="content">
            <p>Dear ${donorName},</p>
            
            <p>Great news! Your donation has been successfully delivered to the receiver.</p>
            
            <div class="info-box">
              <strong>Donation Details:</strong><br>
              <strong>Item:</strong> ${donation.itemName}<br>
              <strong>Quantity:</strong> ${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}<br>
              <strong>Tracking ID:</strong> ${donation.trackingId}<br>
              <strong>Delivered to:</strong> ${receiverName}<br>
              <strong>Delivered by:</strong> ${driverName}
            </div>
            
            <p>Thank you for your generous contribution to reducing food waste and helping those in need!</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Delivery confirmed email sent to donor: ${donor.email}`);
  } catch (error) {
    console.error(`❌ Error sending delivery confirmed email to donor ${donor.email}:`, error.message);
  }
};

/**
 * Send delivery confirmed email to receiver
 */
const sendDeliveryConfirmedEmailToReceiver = async (donation, receiver, driver) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping delivery confirmed email to receiver.');
    return;
  }

  try {
    const receiverName = getUserDisplayName(receiver);
    const driverName = driver?.driverName || 'Driver';
    const donor = await require('../models/User').findById(donation.donorId);
    const donorName = donor ? getUserDisplayName(donor) : 'Donor';
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: receiver.email,
      subject: '✅ Your Food Donation Has Arrived!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .success-icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .info-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #1b4332;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="success-icon">🎉</div>
            <h1 style="margin: 0;">Delivery Complete!</h1>
          </div>
          <div class="content">
            <p>Dear ${receiverName},</p>
            
            <p>Your food donation has been successfully delivered!</p>
            
            <div class="info-box">
              <strong>Donation Details:</strong><br>
              <strong>Item:</strong> ${donation.itemName}<br>
              <strong>Quantity:</strong> ${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}<br>
              <strong>Tracking ID:</strong> ${donation.trackingId}<br>
              <strong>From:</strong> ${donorName}<br>
              <strong>Delivered by:</strong> ${driverName}
            </div>
            
            <p>Please ensure the food is stored properly according to the storage recommendations.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Delivery confirmed email sent to receiver: ${receiver.email}`);
  } catch (error) {
    console.error(`❌ Error sending delivery confirmed email to receiver ${receiver.email}:`, error.message);
  }
};

/**
 * Send donation expiry warning email to donor
 * Sent 1-2 hours before donation expires
 */
const sendDonationExpiryWarningEmail = async (donation, donor) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping donation expiry warning email.');
    return;
  }

  try {
    const donorName = getUserDisplayName(donor);
    const expiryDate = new Date(donation.expiryDate);
    const expiryTime = expiryDate.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: donor.email,
      subject: '⚠️ Your Donation Will Expire Soon',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .warning-box {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 20px 0;
            }
            .info-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">⚠️ Expiry Warning</h1>
          </div>
          <div class="content">
            <p>Dear ${donorName},</p>
            
            <div class="warning-box">
              <strong>⚠️ Important:</strong> Your donation will expire soon!
            </div>
            
            <div class="info-box">
              <strong>Donation Details:</strong><br>
              <strong>Item:</strong> ${donation.itemName}<br>
              <strong>Quantity:</strong> ${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}<br>
              <strong>Tracking ID:</strong> ${donation.trackingId || 'N/A'}<br>
              <strong>Expires:</strong> ${expiryTime}
            </div>
            
            <p>Your donation is expiring soon. If it hasn't been claimed or picked up yet, it will be automatically removed from the platform after the expiry time.</p>
            
            <p>Please check the status of your donation in your dashboard. If you'd like to extend the expiry or make any changes, please contact us.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Donation expiry warning email sent to donor: ${donor.email}`);
  } catch (error) {
    console.error(`❌ Error sending donation expiry warning email to donor ${donor.email}:`, error.message);
    throw error;
  }
};

/**
 * Send donation deleted email to donor
 * Sent after donation is automatically deleted due to expiration
 */
const sendDonationDeletedEmail = async (donation, donor) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping donation deleted email.');
    return;
  }

  try {
    const donorName = getUserDisplayName(donor);
    const expiryDate = new Date(donation.expiryDate);
    const expiryTime = expiryDate.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: donor.email,
      subject: 'Your Donation Has Been Removed - Expired',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .info-box {
              background: #fee2e2;
              border-left: 4px solid #ef4444;
              padding: 15px;
              margin: 20px 0;
            }
            .encouragement-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">Donation Removed</h1>
          </div>
          <div class="content">
            <p>Dear ${donorName},</p>
            
            <p>We wanted to inform you that your donation has been automatically removed from the platform due to expiration.</p>
            
            <div class="info-box">
              <strong>Removed Donation Details:</strong><br>
              <strong>Item:</strong> ${donation.itemName}<br>
              <strong>Quantity:</strong> ${donation.quantity} ${donation.quantity === 1 ? 'serving' : 'servings'}<br>
              <strong>Tracking ID:</strong> ${donation.trackingId || 'N/A'}<br>
              <strong>Expired On:</strong> ${expiryTime}<br>
              <strong>Status:</strong> ${donation.status}
            </div>
            
            <p><strong>Reason for Removal:</strong> The donation reached its expiry date and was automatically removed to maintain food safety standards.</p>
            
            <div class="encouragement-box">
              <strong>💚 Thank You for Your Contribution!</strong><br>
              We appreciate your effort to reduce food waste. Even though this donation expired, your willingness to help makes a difference. We encourage you to create a new donation when you have food available.
            </div>
            
            <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Donation deleted email sent to donor: ${donor.email}`);
  } catch (error) {
    console.error(`❌ Error sending donation deleted email to donor ${donor.email}:`, error.message);
    throw error;
  }
};

/**
 * Send impact receipt email to donor with PDF attachment
 * @param {Object} receipt - Impact receipt data
 * @param {Object} donation - Donation data
 * @param {Object} donor - Donor user data
 * @param {Buffer} pdfBuffer - PDF buffer to attach
 */
const sendReceiptEmailToDonor = async (receipt, donation, donor, pdfBuffer) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping receipt email to donor.');
    return;
  }

  try {
    // Ensure donor has role for getUserDisplayName to work correctly
    if (!donor.role) {
      donor.role = 'Donor';
    }
    const donorName = getUserDisplayName(donor);
    const itemName = donation.itemName || donation.donation?.itemName || 'Food Item';
    const peopleFed = receipt.peopleFed || 0;
    
    // Ensure methaneSaved is properly accessed and formatted
    let methaneSavedValue = receipt.methaneSaved;
    if (typeof methaneSavedValue === 'undefined' || methaneSavedValue === null) {
      methaneSavedValue = 0;
    }
    const methaneSaved = typeof methaneSavedValue === 'number' 
      ? methaneSavedValue.toFixed(2) 
      : parseFloat(methaneSavedValue || 0).toFixed(2);
    
    console.log(`[EmailService] Donor email - methaneSaved: ${methaneSaved} (from receipt: ${receipt.methaneSaved})`);

    const mailOptions = {
      from: EMAIL_FROM,
      to: donor.email,
      subject: 'Thank You! Your Donation Impact Receipt',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .impact-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
            }
            .metrics {
              display: flex;
              justify-content: space-around;
              margin: 20px 0;
              flex-wrap: wrap;
            }
            .metric {
              text-align: center;
              padding: 10px;
            }
            .metric-value {
              font-size: 24px;
              font-weight: 700;
              color: #1b4332;
            }
            .metric-label {
              font-size: 12px;
              color: #666;
              margin-top: 5px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">Thank You for Your Donation!</h1>
          </div>
          <div class="content">
            <p>Dear ${donorName},</p>
            
            <p>Thank you for your generous donation of <strong>${itemName}</strong>. Your contribution has made a significant impact in our community!</p>
            
            <div class="impact-box">
              <strong>Your Impact:</strong><br>
              Your donation has helped feed <strong>${peopleFed}</strong> ${peopleFed === 1 ? 'person' : 'people'} and saved <strong>${methaneSaved} KG</strong> of methane emissions from entering the atmosphere.
            </div>
            
            <div class="metrics">
              <div class="metric">
                <div class="metric-value">${peopleFed}</div>
                <div class="metric-label">People Fed</div>
              </div>
              <div class="metric">
                <div class="metric-value">${methaneSaved} KG</div>
                <div class="metric-label">Methane Saved</div>
              </div>
            </div>
            
            <p>We've attached your impact receipt for your records. This receipt contains all the details about your donation and the positive impact it has created.</p>
            
            <p>Your commitment to reducing food waste and helping those in need is truly appreciated. Together, we are making a difference!</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `impact-receipt-${donation.trackingId || donation.donationId || 'receipt'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Receipt email sent to donor: ${donor.email}`);
  } catch (error) {
    console.error(`❌ Error sending receipt email to donor ${donor.email}:`, error.message);
    throw error;
  }
};

/**
 * Send impact receipt email to driver with PDF attachment
 * @param {Object} receipt - Impact receipt data
 * @param {Object} donation - Donation data
 * @param {Object} driver - Driver user data
 * @param {Buffer} pdfBuffer - PDF buffer to attach
 */
const sendReceiptEmailToDriver = async (receipt, donation, driver, pdfBuffer) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping receipt email to driver.');
    return;
  }

  try {
    // Ensure driver has role for getUserDisplayName to work correctly
    if (!driver.role) {
      driver.role = 'Driver';
    }
    const driverName = getUserDisplayName(driver);
    const itemName = donation.itemName || donation.donation?.itemName || 'Food Item';
    const receiverName = donation.receiver?.receiverName || donation.receiver?.email || 'Receiver';
    const distance = receipt.distanceTraveled?.toFixed(2) || '0.00';
    const peopleFed = receipt.peopleFed || 0;
    
    // Ensure methaneSaved is properly accessed and formatted
    let methaneSavedValue = receipt.methaneSaved;
    if (typeof methaneSavedValue === 'undefined' || methaneSavedValue === null) {
      methaneSavedValue = 0;
    }
    const methaneSaved = typeof methaneSavedValue === 'number' 
      ? methaneSavedValue.toFixed(2) 
      : parseFloat(methaneSavedValue || 0).toFixed(2);
    
    console.log(`[EmailService] Driver email - methaneSaved: ${methaneSaved} (from receipt: ${receipt.methaneSaved})`);

    const mailOptions = {
      from: EMAIL_FROM,
      to: driver.email,
      subject: 'Delivery Impact Receipt - Thank You!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .impact-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
            }
            .metrics {
              display: flex;
              justify-content: space-around;
              margin: 20px 0;
              flex-wrap: wrap;
            }
            .metric {
              text-align: center;
              padding: 10px;
            }
            .metric-value {
              font-size: 24px;
              font-weight: 700;
              color: #1b4332;
            }
            .metric-label {
              font-size: 12px;
              color: #666;
              margin-top: 5px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">Thank You for Your Delivery Service!</h1>
          </div>
          <div class="content">
            <p>Dear ${driverName},</p>
            
            <p>Thank you for your excellent delivery service! You played a crucial role in making this donation a success.</p>
            
            <div class="impact-box">
              <strong>Your Delivery Impact:</strong><br>
              You traveled <strong>${distance} KM</strong> to deliver <strong>${itemName}</strong> to <strong>${receiverName}</strong>, helping feed <strong>${peopleFed}</strong> ${peopleFed === 1 ? 'person' : 'people'}.
            </div>
            
            <div class="metrics">
              <div class="metric">
                <div class="metric-value">${distance} KM</div>
                <div class="metric-label">Distance Traveled</div>
              </div>
              <div class="metric">
                <div class="metric-value">${peopleFed}</div>
                <div class="metric-label">People Fed</div>
              </div>
            </div>
            
            <p>Your dedication to reducing food waste and helping connect donors with those in need is greatly appreciated. Without your reliable delivery service, this impact would not have been possible.</p>
            
            <p>We've attached the impact receipt for your records. This receipt shows the complete impact of the delivery you completed.</p>
            
            <p>Thank you for being an essential part of the FoodLoop community!</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `impact-receipt-${donation.trackingId || donation.donationId || 'receipt'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Receipt email sent to driver: ${driver.email}`);
  } catch (error) {
    console.error(`❌ Error sending receipt email to driver ${driver.email}:`, error.message);
    throw error;
  }
};

/**
 * Send review submitted email to user
 * @param {Object} user - User who submitted the review
 * @param {Object} review - Review data
 */
const sendReviewSubmittedEmail = async (user, review) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping review submitted email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);

    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Thank You! Your Review is Under Review',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .review-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">Thank You for Your Review!</h1>
          </div>
          <div class="content">
            <p>Dear ${userName},</p>
            
            <p>Thank you for taking the time to share your experience with FoodLoop! We truly value your feedback.</p>
            
            <div class="review-box">
              "${review.reviewText}"
            </div>
            
            <p><strong>Your review is currently under review.</strong></p>
            <p>Our admin team will carefully review your submission to ensure it meets our community guidelines. This process typically takes 1-2 business days.</p>
            
            <p>Once approved, your review will appear on our home page for the entire FoodLoop community to see!</p>
            
            <p>We appreciate your patience during this review process.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Review submitted email sent to: ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending review submitted email to ${user.email}:`, error.message);
    throw error;
  }
};

/**
 * Send review approved email to user
 * @param {Object} user - User who submitted the review
 * @param {Object} review - Review data
 */
const sendReviewApprovedEmail = async (user, review) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping review approved email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);

    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Great News! Your Review is Now Live',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .success-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">Your Review is Now Live! 🎉</h1>
          </div>
          <div class="content">
            <p>Dear ${userName},</p>
            
            <p><strong>Great news!</strong> Your review has been approved and is now live on our home page!</p>
            
            <div class="success-box">
              "${review.reviewText}"
            </div>
            
            <p>Your feedback is now visible to the entire FoodLoop community, helping others learn about the positive impact of our platform.</p>
            
            <p>Thank you for being part of the FoodLoop community and for sharing your experience!</p>
            
            <p>You can view your review on our <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="color: #1b4332; text-decoration: none; font-weight: bold;">home page</a>.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Review approved email sent to: ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending review approved email to ${user.email}:`, error.message);
    throw error;
  }
};

/**
 * Send review rejected email to user
 * @param {Object} user - User who submitted the review
 * @param {Object} review - Review data
 * @param {String} reason - Rejection reason
 */
const sendReviewRejectedEmail = async (user, review, reason) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping review rejected email.');
    return;
  }

  try {
    const userName = getUserDisplayName(user);

    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Review Update',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .reason-box {
              background: #fef2f2;
              border-left: 4px solid #ef4444;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">Review Update</h1>
          </div>
          <div class="content">
            <p>Dear ${userName},</p>
            
            <p>Thank you for taking the time to submit a review for FoodLoop.</p>
            
            <p>After careful review, we're sorry to inform you that your review could not be published at this time.</p>
            
            <div class="reason-box">
              <strong>Reason:</strong><br>
              ${reason}
            </div>
            
            <p>We encourage you to submit a new review that aligns with our community guidelines. If you have any questions about this decision, please feel free to contact us.</p>
            
            <p>Thank you for your understanding and continued support of FoodLoop.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you have any questions, contact us at <strong>foodloop.official27@gmail.com</strong>
            </p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Review rejected email sent to: ${user.email}`);
  } catch (error) {
    console.error(`❌ Error sending review rejected email to ${user.email}:`, error.message);
    throw error;
  }
};

/**
 * Send confirmation email when user submits contact form
 */
const sendContactConfirmationEmail = async (email, name) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping contact confirmation email.');
    return;
  }

  try {
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'We received your message – FoodLoop',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">FoodLoop</h2>
          </div>
          <div class="content">
            <p>Hi ${name || 'there'},</p>
            <p>You have contacted admin. We will get back to you soon.</p>
            <p>Thank you for reaching out.</p>
          </div>
          <div class="footer">
            <p>This is an automated email from FoodLoop.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Contact confirmation email sent to: ${email}`);
  } catch (error) {
    console.error(`❌ Error sending contact confirmation email to ${email}:`, error.message);
    throw error;
  }
};

/**
 * Send admin reply to user who submitted contact form
 */
const sendContactReplyEmail = async (email, name, replyText) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping contact reply email.');
    return;
  }

  try {
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Re: Your message to FoodLoop',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .reply { background: #fff; border-left: 4px solid #1F4E36; padding: 16px; margin: 16px 0; white-space: pre-wrap; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">FoodLoop – Admin Reply</h2>
          </div>
          <div class="content">
            <p>Hi ${name || 'there'},</p>
            <p>Here is a reply from our team:</p>
            <div class="reply">${(replyText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</div>
            <p>Thank you for contacting FoodLoop.</p>
          </div>
          <div class="footer">
            <p>This is an automated email from FoodLoop.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Contact reply email sent to: ${email}`);
  } catch (error) {
    console.error(`❌ Error sending contact reply email to ${email}:`, error.message);
    throw error;
  }
};

/**
 * Send admin login notification email (time, location, device)
 */
const sendAdminLoginNotificationEmail = async (adminEmail, { time, location, device }) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping admin login notification.');
    return;
  }

  try {
    const safe = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const mailOptions = {
      from: EMAIL_FROM,
      to: adminEmail,
      subject: 'New admin login – FoodLoop',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .row { margin: 12px 0; }
            .label { font-weight: 600; color: #1F4E36; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">Admin Login – FoodLoop</h2>
          </div>
          <div class="content">
            <p>A login to your admin account was detected.</p>
            <div class="row"><span class="label">Time:</span> ${safe(time)}</div>
            <div class="row"><span class="label">Location:</span> ${safe(location)}</div>
            <div class="row"><span class="label">Device:</span> ${safe(device)}</div>
          </div>
          <div class="footer">
            <p>This is an automated security notification from FoodLoop.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Admin login notification email sent to: ${adminEmail}`);
  } catch (error) {
    console.error(`❌ Error sending admin login notification to ${adminEmail}:`, error.message);
    throw error;
  }
};

/**
 * Send password reset link email
 */
const sendPasswordResetEmail = async (email, resetLink) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping password reset email.');
    return;
  }

  try {
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Reset your FoodLoop password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #1F4E36; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0; font-weight: 700; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">FoodLoop – Password Reset</h2>
          </div>
          <div class="content">
            <p>You requested a password reset. Click the link below to set a new password. This link expires in 1 hour.</p>
            <p><a href="${(resetLink || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" class="button" style="color: #ffffff !important; font-weight: 700; text-decoration: none;">Reset password</a></p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
          <div class="footer">
            <p>This is an automated email from FoodLoop.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to: ${email}`);
  } catch (error) {
    console.error(`❌ Error sending password reset email to ${email}:`, error.message);
    throw error;
  }
};

/**
 * Send confirmation email after password has been changed (post-reset)
 */
const sendPasswordChangedEmail = async (email) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping password changed email.');
    return;
  }

  try {
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Your FoodLoop password has been changed',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">FoodLoop – Password Changed</h2>
          </div>
          <div class="content">
            <p>Your FoodLoop account password has been changed successfully.</p>
            <p>If you did not make this change, please reset your password immediately using the "Forgot password" link on the login page, or contact us for assistance.</p>
          </div>
          <div class="footer">
            <p>This is an automated security notification from FoodLoop.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Password changed confirmation email sent to: ${email}`);
  } catch (error) {
    console.error(`❌ Error sending password changed email to ${email}:`, error.message);
    throw error;
  }
};

/**
 * Send admin notification email to a user (title + message)
 */
const sendNotificationEmail = async (email, title, message) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping notification email.');
    return;
  }

  try {
    const safe = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const subject = title && title.trim() ? `FoodLoop: ${safe(title)}` : 'FoodLoop – New notification';
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .message { background: #fff; border-left: 4px solid #1F4E36; padding: 16px; margin: 16px 0; white-space: pre-wrap; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">FoodLoop – Notification</h2>
          </div>
          <div class="content">
            <p>You have a new notification from FoodLoop.</p>
            ${title && title.trim() ? `<p><strong>${safe(title)}</strong></p>` : ''}
            <div class="message">${safe(message)}</div>
            <p>Log in to the app to see all your notifications.</p>
          </div>
          <div class="footer">
            <p>This is an automated email from FoodLoop.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Notification email sent to: ${email}`);
  } catch (error) {
    console.error(`❌ Error sending notification email to ${email}:`, error.message);
    throw error;
  }
};

/**
 * Send email when user profile is updated (list of changed fields)
 * @param {string} email - User's email (recipient)
 * @param {string[]} changedFields - Human-readable list of changed field names, e.g. ['Name', 'Contact Number']
 */
const sendProfileUpdatedEmail = async (email, changedFields) => {
  if (!isEmailConfigured() || !transporter) {
    console.warn('Email not configured. Skipping profile updated email.');
    return;
  }
  if (!changedFields || changedFields.length === 0) {
    return;
  }

  const listItems = changedFields.map((f) => `<li>${f}</li>`).join('');
  try {
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Your FoodLoop profile was updated',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(180deg, #1F4E36 0%, #48B47D 100%); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            ul { margin: 12px 0; padding-left: 24px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">FoodLoop – Profile Updated</h2>
          </div>
          <div class="content">
            <p>Your FoodLoop profile has been updated successfully. The following details were changed:</p>
            <ul>${listItems}</ul>
            <p>If you did not make these changes, please contact us or reset your password if needed.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from FoodLoop.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Profile updated email sent to: ${email}`);
  } catch (error) {
    console.error(`❌ Error sending profile updated email to ${email}:`, error.message);
    throw error;
  }
};

module.exports = {
  getUserDisplayName,
  sendWelcomeEmail,
  sendPendingApprovalEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendDeactivationEmail,
  sendActivationEmail,
  sendDonationLiveEmail,
  sendNewDonationNotificationToReceivers,
  sendNewDonationNotificationToReceiver,
  sendDonationClaimedEmail,
  sendDonationAvailableNotificationToDrivers,
  sendDonationAvailableNotificationToDriver,
  sendPickupConfirmedEmailToDonor,
  sendPickupConfirmedEmailToReceiver,
  sendDeliveryConfirmedEmailToDonor,
  sendDeliveryConfirmedEmailToReceiver,
  sendDonationExpiryWarningEmail,
  sendDonationDeletedEmail,
  sendReceiptEmailToDonor,
  sendReceiptEmailToDriver,
  sendReviewSubmittedEmail,
  sendReviewApprovedEmail,
  sendReviewRejectedEmail,
  sendContactConfirmationEmail,
  sendContactReplyEmail,
  sendAdminLoginNotificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendProfileUpdatedEmail,
  sendNotificationEmail,
};
