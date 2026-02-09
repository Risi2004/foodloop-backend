/**
 * Expired Donation Service
 * Handles automatic deletion of expired donations and sending email notifications
 */

const Donation = require('../models/Donation');
const User = require('../models/User');

/**
 * Check and delete expired donations
 * Finds all expired donations (excluding delivered ones) and deletes them
 * Sends deletion notification emails to donors
 */
const checkAndDeleteExpiredDonations = async () => {
  try {
    const currentDate = new Date();
    
    // Find expired donations (excluding delivered ones to preserve history)
    const expiredDonations = await Donation.find({
      expiryDate: { $lte: currentDate },
      status: { $ne: 'delivered' }, // Keep delivered donations for history
    })
      .populate('donorId', 'email donorType username businessName')
      .lean();

    if (!expiredDonations || expiredDonations.length === 0) {
      console.log('[ExpiredDonationService] No expired donations to delete');
      return { deleted: 0, errors: 0 };
    }

    console.log(`[ExpiredDonationService] Found ${expiredDonations.length} expired donation(s) to delete`);

    const { sendDonationDeletedEmail } = require('../utils/emailService');
    let deletedCount = 0;
    let errorCount = 0;

    // Process each expired donation
    for (const donation of expiredDonations) {
      try {
        const donor = donation.donorId;
        
        if (!donor) {
          console.warn(`[ExpiredDonationService] Donor not found for donation ${donation._id}, deleting anyway`);
        } else {
          // Send deletion notification email (async, don't block deletion)
          sendDonationDeletedEmail(donation, donor)
            .catch(error => {
              console.error(`[ExpiredDonationService] Error sending deletion email for donation ${donation._id}:`, error.message);
              // Continue with deletion even if email fails
            });
        }

        // Delete the donation
        await Donation.findByIdAndDelete(donation._id);
        deletedCount++;
        
        console.log(`[ExpiredDonationService] Deleted expired donation: ${donation.trackingId || donation._id}`);
      } catch (error) {
        errorCount++;
        console.error(`[ExpiredDonationService] Error deleting donation ${donation._id}:`, error.message);
        // Continue with next donation even if one fails
      }
    }

    console.log(`[ExpiredDonationService] Deletion complete: ${deletedCount} deleted, ${errorCount} errors`);
    return { deleted: deletedCount, errors: errorCount };
  } catch (error) {
    console.error('[ExpiredDonationService] Error in checkAndDeleteExpiredDonations:', error);
    return { deleted: 0, errors: 1 };
  }
};

/**
 * Send expiry warning emails to donors
 * Checks for donations expiring in the next 1-2 hours and sends warning emails
 */
const sendExpiryWarningEmails = async () => {
  try {
    const currentDate = new Date();
    const oneHourFromNow = new Date(currentDate.getTime() + 60 * 60 * 1000); // 1 hour from now
    const twoHoursFromNow = new Date(currentDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

    // Find donations expiring in the next 1-2 hours (excluding delivered ones)
    const expiringSoonDonations = await Donation.find({
      expiryDate: {
        $gte: oneHourFromNow,
        $lte: twoHoursFromNow,
      },
      status: { $ne: 'delivered' }, // Don't warn about delivered donations
    })
      .populate('donorId', 'email donorType username businessName')
      .lean();

    if (!expiringSoonDonations || expiringSoonDonations.length === 0) {
      console.log('[ExpiredDonationService] No donations expiring soon');
      return { sent: 0, errors: 0 };
    }

    console.log(`[ExpiredDonationService] Found ${expiringSoonDonations.length} donation(s) expiring soon`);

    const { sendDonationExpiryWarningEmail } = require('../utils/emailService');
    let sentCount = 0;
    let errorCount = 0;

    // Track which donors we've already notified (to avoid duplicate emails)
    const notifiedDonors = new Set();

    // Send warning emails
    for (const donation of expiringSoonDonations) {
      try {
        const donor = donation.donorId;
        
        if (!donor) {
          console.warn(`[ExpiredDonationService] Donor not found for donation ${donation._id}`);
          continue;
        }

        // Skip if we've already sent a warning to this donor in this batch
        // (in case they have multiple donations expiring)
        const donorKey = donor._id.toString();
        if (notifiedDonors.has(donorKey)) {
          console.log(`[ExpiredDonationService] Already notified donor ${donorKey} in this batch, skipping`);
          continue;
        }

        // Send warning email
        await sendDonationExpiryWarningEmail(donation, donor);
        notifiedDonors.add(donorKey);
        sentCount++;
        
        console.log(`[ExpiredDonationService] Sent expiry warning for donation: ${donation.trackingId || donation._id}`);
      } catch (error) {
        errorCount++;
        console.error(`[ExpiredDonationService] Error sending warning email for donation ${donation._id}:`, error.message);
        // Continue with next donation even if one fails
      }
    }

    console.log(`[ExpiredDonationService] Warning emails sent: ${sentCount} sent, ${errorCount} errors`);
    return { sent: sentCount, errors: errorCount };
  } catch (error) {
    console.error('[ExpiredDonationService] Error in sendExpiryWarningEmails:', error);
    return { sent: 0, errors: 1 };
  }
};

module.exports = {
  checkAndDeleteExpiredDonations,
  sendExpiryWarningEmails,
};
