const express = require('express');
const router = express.Router();
const { handleFileUpload } = require('../middleware/upload');
const { uploadDonationImageToS3 } = require('../config/awsS3');
const { analyzeFoodImage } = require('../services/aiService');
const { AI_SERVICE_URL } = require('../config/env');
const { authenticateUser } = require('../middleware/auth');
const Donation = require('../models/Donation');
const User = require('../models/User');
const { calculateExpiryDate } = require('../services/expiryService');
const { 
  sendDonationLiveEmail, 
  sendNewDonationNotificationToReceivers,
  sendReceiptEmailToDonor,
  sendReceiptEmailToDriver,
} = require('../utils/emailService');
const { geocodeAddress, calculateDistance } = require('../services/geocodingService');
const ImpactReceipt = require('../models/ImpactReceipt');
const { generateImpactReceiptPDF } = require('../services/pdfService');
const { getBadgeProgress, DONOR_MILESTONES, DONOR_BADGE_NAMES, DRIVER_MILESTONES, DRIVER_BADGE_NAMES } = require('../utils/badgeConfig');
const socketService = require('../services/socketService');

// Apply file upload middleware for image uploads
router.use(express.json());

/**
 * POST /api/donations/upload-image
 * Upload donation image to S3 with lossless quality preservation
 */
router.post('/upload-image', handleFileUpload, async (req, res) => {
  try {
    // Check if image file is present
    if (!req.files || !req.files.image || !req.files.image[0]) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'image', message: 'Image file is required' }],
      });
    }

    const imageFile = req.files.image[0];

    // Validate file type
    if (!imageFile.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'image', message: 'File must be an image' }],
      });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (imageFile.size > maxSize) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'image', message: 'Image size must be less than 10MB' }],
      });
    }

    // Upload to S3 with lossless quality
    const imageUrl = await uploadDonationImageToS3(imageFile);

    res.status(200).json({
      success: true,
      imageUrl: imageUrl,
      message: 'Image uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading donation image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/donations/analyze-image
 * Analyze food image using AI service
 * Accepts either imageUrl or image file
 */
router.post('/analyze-image', handleFileUpload, async (req, res) => {
  try {
    console.log('[Donations] Analyze image request received');
    let imageUrl = req.body.imageUrl;
    let imageFile = null;

    // Check if image file is provided
    if (req.files && req.files.image && req.files.image[0]) {
      imageFile = req.files.image[0];
      console.log('[Donations] Image file provided:', {
        name: imageFile.originalname,
        size: imageFile.size,
        mimetype: imageFile.mimetype
      });
      
      // Validate file type
      if (!imageFile.mimetype.startsWith('image/')) {
        return res.status(400).json({
          success: false,
          errors: [{ field: 'image', message: 'File must be an image' }],
        });
      }

      // Upload to S3 first if file is provided
      console.log('[Donations] Uploading image to S3...');
      imageUrl = await uploadDonationImageToS3(imageFile);
      console.log('[Donations] Image uploaded to S3:', imageUrl);
    }

    // Validate that we have an image URL
    if (!imageUrl) {
      console.error('[Donations] No image URL provided');
      return res.status(400).json({
        success: false,
        errors: [{ field: 'imageUrl', message: 'Image URL or image file is required' }],
      });
    }

    // Call AI service for analysis
    console.log('[Donations] Calling AI service for analysis...');
    const predictions = await analyzeFoodImage(imageUrl);
    console.log('[Donations] AI analysis complete:', {
      foodCategory: predictions.foodCategory,
      itemName: predictions.itemName,
      quantity: predictions.quantity,
      confidence: predictions.confidence
    });

    res.status(200).json({
      success: true,
      predictions: predictions,
      imageUrl: imageUrl,
    });
  } catch (error) {
    console.error('[Donations] Error analyzing image:', error.message);
    console.error('[Donations] Error stack:', error.stack);
    
    // Handle validation errors (AI-generated images or non-food items detected)
    if (error.message.includes('AI-generated') || 
        error.message.includes('ai-generated') ||
        error.message.includes('synthetic') ||
        error.message.includes('fake') ||
        error.message.includes('computer-generated')) {
      return res.status(400).json({
        success: false,
        message: 'AI-generated images are not allowed. Please upload a real photo of food.',
        errors: [{ field: 'image', message: 'AI-generated images are not allowed. Please upload a real photo of food.' }],
      });
    }
    
    // Handle non-food items errors
    if (error.message.includes('does not contain food') || 
        error.message.includes('Non-food items') || 
        error.message.includes('No food items') ||
        error.message.includes('not related to food')) {
      return res.status(400).json({
        success: false,
        message: 'This image is not related to food items. Please upload an image of food only.',
        errors: [{ field: 'image', message: 'This image is not related to food items. Please upload an image of food only.' }],
      });
    }
    
    // Handle temporary AI service errors - allow users to proceed without AI verification
    // This includes rate limits, timeouts, and service unavailability
    if (error.message.includes('rate limit') || 
        error.message.includes('quota') || 
        error.message.includes('429') ||
        error.message.includes('AI service') || 
        error.message.includes('timeout') || 
        error.message.includes('not available') ||
        error.message.includes('temporarily unavailable')) {
      // Return success with image URL but no predictions - user can fill form manually
      console.log('[Donations] AI service unavailable, allowing user to proceed with image upload');
      return res.status(200).json({
        success: true,
        predictions: null, // No AI predictions available
        imageUrl: imageUrl, // Image was uploaded successfully
        message: 'Image uploaded successfully. AI analysis is temporarily unavailable. Please fill the form manually.',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to analyze image',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/ai-service-status
 * Check AI service connectivity and status
 */
router.get('/ai-service-status', async (req, res) => {
  try {
    const status = {
      configured: !!AI_SERVICE_URL,
      url: AI_SERVICE_URL || 'Not configured',
      timestamp: new Date().toISOString(),
    };

    // Try to connect to AI service
    if (AI_SERVICE_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check

        const response = await fetch(`${AI_SERVICE_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const healthData = await response.json();
          status.connected = true;
          status.health = healthData;
        } else {
          status.connected = false;
          status.error = `Health check returned status ${response.status}`;
        }
      } catch (error) {
        status.connected = false;
        status.error = error.message;
      }
    } else {
      status.connected = false;
      status.error = 'AI service URL not configured';
    }

    res.status(200).json({
      success: true,
      status: status,
    });
  } catch (error) {
    console.error('[Donations] Error checking AI service status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check AI service status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/donations
 * Create a new donation
 * Requires authentication (Donor role)
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Donor
    if (req.user.role !== 'Donor') {
      return res.status(403).json({
        success: false,
        message: 'Only donors can create donations',
      });
    }

    const {
      foodCategory,
      itemName,
      quantity,
      storageRecommendation,
      imageUrl,
      preferredPickupDate,
      preferredPickupTimeFrom,
      preferredPickupTimeTo,
      aiConfidence,
      aiQualityScore,
      aiFreshness,
      aiDetectedItems,
      productType,
      expiryDateFromPackage,
      userProvidedExpiryDate,
      donorLatitude,
      donorLongitude,
    } = req.body;

    // Validate required fields
    const requiredFields = {
      foodCategory,
      itemName,
      quantity,
      storageRecommendation,
      imageUrl,
      preferredPickupDate,
      preferredPickupTimeFrom,
      preferredPickupTimeTo,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors: missingFields.map(field => ({
          field,
          message: `${field} is required`,
        })),
      });
    }

    // Validate enum values
    const validCategories = ['Cooked Meals', 'Raw Food', 'Beverages', 'Snacks', 'Desserts'];
    if (!validCategories.includes(foodCategory)) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'foodCategory', message: 'Invalid food category' }],
      });
    }

    const validStorage = ['Hot', 'Cold', 'Dry'];
    if (!validStorage.includes(storageRecommendation)) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'storageRecommendation', message: 'Invalid storage recommendation' }],
      });
    }

    // Validate pickup date (should be a valid date string)
    let pickupDate;
    try {
      pickupDate = new Date(preferredPickupDate);
      if (isNaN(pickupDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'preferredPickupDate', message: 'Invalid pickup date format' }],
      });
    }

    // Validate quantity
    if (typeof quantity !== 'number' || quantity < 1) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'quantity', message: 'Quantity must be a positive number' }],
      });
    }

    // Fetch donor details (address, email) from User model
    const donor = await User.findById(req.user.id);
    if (!donor) {
      return res.status(404).json({
        success: false,
        message: 'Donor not found',
      });
    }

    // Validate donor has required fields
    if (!donor.address) {
      return res.status(400).json({
        success: false,
        message: 'Donor address is missing. Please update your profile with an address.',
      });
    }

    if (!donor.email) {
      return res.status(400).json({
        success: false,
        message: 'Donor email is missing. Please update your profile.',
      });
    }

    // Determine product type (from AI or default to 'cooked')
    const finalProductType = productType === 'packed' ? 'packed' : 'cooked';
    
    // Parse expiry date from package (if provided)
    let parsedExpiryFromPackage = null;
    if (expiryDateFromPackage) {
      try {
        parsedExpiryFromPackage = new Date(expiryDateFromPackage);
        if (isNaN(parsedExpiryFromPackage.getTime())) {
          parsedExpiryFromPackage = null;
        }
      } catch (error) {
        parsedExpiryFromPackage = null;
      }
    }
    
    // Use user-provided expiry if AI didn't detect it and user provided one
    if (!parsedExpiryFromPackage && userProvidedExpiryDate) {
      try {
        parsedExpiryFromPackage = new Date(userProvidedExpiryDate);
        if (isNaN(parsedExpiryFromPackage.getTime())) {
          parsedExpiryFromPackage = null;
        }
      } catch (error) {
        parsedExpiryFromPackage = null;
      }
    }

    // Calculate expiry date
    const expiryDate = calculateExpiryDate({
      productType: finalProductType,
      expiryDateFromPackage: parsedExpiryFromPackage,
      userProvidedExpiryDate: userProvidedExpiryDate ? new Date(userProvidedExpiryDate) : null,
      createdAt: new Date(),
    });

    // Determine coordinates: Use donor-confirmed coordinates if provided, otherwise geocode address
    let finalLatitude = null;
    let finalLongitude = null;

    if (donorLatitude && donorLongitude) {
      // Validate coordinates are within Sri Lanka bounds
      if (donorLatitude >= 5 && donorLatitude <= 10 && 
          donorLongitude >= 79 && donorLongitude <= 82) {
        finalLatitude = donorLatitude;
        finalLongitude = donorLongitude;
        console.log(`[Donations] Using donor-confirmed coordinates: [${finalLatitude}, ${finalLongitude}]`);
      } else {
        console.warn(`[Donations] Donor-provided coordinates [${donorLatitude}, ${donorLongitude}] are outside Sri Lanka bounds, will geocode address instead`);
      }
    }

    // If no valid donor coordinates, geocode the address
    if (!finalLatitude || !finalLongitude) {
      if (donor.address) {
        const geocodedCoords = await geocodeAddress(donor.address);
        if (geocodedCoords) {
          finalLatitude = geocodedCoords.lat;
          finalLongitude = geocodedCoords.lng;
          console.log(`[Donations] Geocoded address to coordinates: [${finalLatitude}, ${finalLongitude}]`);
        }
      }
    }

    // Create donation
    const donation = new Donation({
      donorId: req.user.id,
      foodCategory,
      itemName,
      quantity,
      storageRecommendation,
      imageUrl,
      preferredPickupDate: pickupDate,
      preferredPickupTimeFrom,
      preferredPickupTimeTo,
      productType: finalProductType,
      expiryDate,
      expiryDateFromPackage: parsedExpiryFromPackage,
      donorAddress: donor.address,
      donorEmail: donor.email,
      donorLatitude: finalLatitude,
      donorLongitude: finalLongitude,
      aiConfidence: aiConfidence || null,
      aiQualityScore: aiQualityScore || null,
      aiFreshness: aiFreshness || null,
      aiDetectedItems: Array.isArray(aiDetectedItems) ? aiDetectedItems : [],
      status: 'pending',
    });

    await donation.save();

    console.log('[Donations] Donation created successfully:', {
      donationId: donation._id,
      trackingId: donation.trackingId,
      donorId: donation.donorId,
      itemName: donation.itemName,
      productType: donation.productType,
      expiryDate: donation.expiryDate,
    });

    // Send email notifications (async, don't block response)
    // 1. Send confirmation email to donor
    try {
      await sendDonationLiveEmail(donation, donor);
    } catch (emailError) {
      console.error('[Donations] Error sending donation email to donor:', emailError.message);
      // Don't fail donation creation if email fails
    }

    // 2. Send notification emails to all registered receivers
    // This runs asynchronously and doesn't block the response
    sendNewDonationNotificationToReceivers(donation, donor)
      .catch(error => {
        console.error('[Donations] Error sending notifications to receivers:', error.message);
        // Don't fail donation creation if email fails
      });

    // Notify all connected receivers so Find Food page can refetch
    socketService.emitToRole('Receiver', 'donation_created', { donationId: donation._id.toString() });

    res.status(201).json({
      success: true,
      message: 'Donation created successfully',
      donation: {
        id: donation._id,
        trackingId: donation.trackingId,
        foodCategory: donation.foodCategory,
        itemName: donation.itemName,
        quantity: donation.quantity,
        status: donation.status,
        expiryDate: donation.expiryDate,
        createdAt: donation.createdAt,
      },
    });
  } catch (error) {
    console.error('[Donations] Error creating donation:', error);
    console.error('[Donations] Error stack:', error.stack);
    console.error('[Donations] Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({
      success: false,
      message: 'Failed to create donation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/donations/available
 * Get all available donations for receivers
 * Returns donations with status 'pending' or 'approved' that haven't expired
 * No authentication required - receivers need to see available donations
 */
router.get('/available', async (req, res) => {
  try {
    const currentDate = new Date();
    
    // Fetch donations with status 'pending' or 'approved' that haven't expired and are not claimed
    const donations = await Donation.find({
      status: { $in: ['pending', 'approved'] },
      expiryDate: { $gt: currentDate }, // Only non-expired donations
      assignedReceiverId: null, // Only unclaimed donations
    })
      .populate('donorId', 'address email donorType username businessName')
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Format donations and geocode addresses
    const formattedDonations = await Promise.all(
      donations.map(async (donation) => {
        const donor = donation.donorId;
        const donorName = donor?.donorType === 'Business' 
          ? donor.businessName 
          : donor?.username || donor?.email || 'Anonymous';

        const donorAddress = donation.donorAddress || donor?.address || '';
        
        // Get coordinates (re-geocode if coordinates seem incorrect, otherwise use stored)
        let coordinates = null;
        
        // Check if stored coordinates are valid and within Sri Lanka bounds
        const hasStoredCoords = donation.donorLatitude && donation.donorLongitude;
        const coordsInBounds = hasStoredCoords && 
          donation.donorLatitude >= 5 && donation.donorLatitude <= 10 &&
          donation.donorLongitude >= 79 && donation.donorLongitude <= 82;
        
        if (hasStoredCoords && coordsInBounds) {
          // Use stored coordinates if they're valid
          coordinates = {
            lat: donation.donorLatitude,
            lng: donation.donorLongitude,
          };
          console.log(`[Donations] Using stored coordinates for donation ${donation._id}: [${coordinates.lat}, ${coordinates.lng}]`);
        } else if (donorAddress) {
          // Re-geocode if no stored coordinates or if stored coordinates are invalid
          if (hasStoredCoords && !coordsInBounds) {
            console.log(`[Donations] Stored coordinates for donation ${donation._id} seem invalid, re-geocoding...`);
          }
          
          // Geocode the address
          coordinates = await geocodeAddress(donorAddress);
          
          // Save coordinates back to database (async, don't block response)
          if (coordinates) {
            Donation.findByIdAndUpdate(
              donation._id,
              {
                donorLatitude: coordinates.lat,
                donorLongitude: coordinates.lng,
              },
              { new: true }
            ).catch(err => {
              console.error(`[Donations] Error saving coordinates for donation ${donation._id}:`, err);
            });
          } else {
            console.warn(`[Donations] Failed to geocode address for donation ${donation._id}: ${donorAddress}`);
          }
        }

        return {
          id: donation._id.toString(),
          trackingId: donation.trackingId,
          // Food details
          itemName: donation.itemName,
          foodCategory: donation.foodCategory,
          quantity: donation.quantity,
          imageUrl: donation.imageUrl,
          expiryDate: donation.expiryDate,
          storageRecommendation: donation.storageRecommendation,
          // Donor details
          donorId: donation.donorId?._id?.toString(),
          donorAddress: donorAddress,
          donorEmail: donation.donorEmail || donor?.email,
          donorName: donorName,
          donorType: donor?.donorType,
          // Coordinates for map
          position: coordinates ? [coordinates.lat, coordinates.lng] : null,
          // Pickup information
          preferredPickupDate: donation.preferredPickupDate,
          preferredPickupTimeFrom: donation.preferredPickupTimeFrom,
          preferredPickupTimeTo: donation.preferredPickupTimeTo,
          // AI analysis data
          aiQualityScore: donation.aiQualityScore,
          aiFreshness: donation.aiFreshness,
          aiConfidence: donation.aiConfidence,
          aiDetectedItems: donation.aiDetectedItems || [],
          // Timestamps
          createdAt: donation.createdAt,
          updatedAt: donation.updatedAt,
        };
      })
    );

    console.log(`[Donations] Returning ${formattedDonations.length} available donations`);

    res.status(200).json({
      success: true,
      donations: formattedDonations,
      count: formattedDonations.length,
    });
  } catch (error) {
    console.error('[Donations] Error fetching available donations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available donations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/donations/:id/claim
 * Claim a donation (receiver claims a food donation)
 * Requires authentication (Receiver role)
 */
router.post('/:id/claim', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Receiver
    if (req.user.role !== 'Receiver') {
      return res.status(403).json({
        success: false,
        message: 'Only receivers can claim donations',
      });
    }

    const { id } = req.params;
    const receiverId = req.user.id;

    // Find the donation
    const donation = await Donation.findById(id);
    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    // Check if donation is already claimed
    if (donation.assignedReceiverId) {
      return res.status(400).json({
        success: false,
        message: 'This donation has already been claimed by another receiver',
      });
    }

    // Check if donation is available for claiming (status: 'pending' or 'approved')
    if (!['pending', 'approved'].includes(donation.status)) {
      return res.status(400).json({
        success: false,
        message: `This donation is not available for claiming. Current status: ${donation.status}`,
      });
    }

    // Check if donation has expired
    const currentDate = new Date();
    if (donation.expiryDate <= currentDate) {
      return res.status(400).json({
        success: false,
        message: 'This donation has expired and cannot be claimed',
      });
    }

    // Optional receiver delivery location from request body
    const { receiverLatitude, receiverLongitude, receiverAddress } = req.body || {};
    if (receiverLatitude != null && receiverLongitude != null) {
      const lat = Number(receiverLatitude);
      const lng = Number(receiverLongitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 5 && lat <= 10 && lng >= 79 && lng <= 82) {
        donation.receiverLatitude = lat;
        donation.receiverLongitude = lng;
        donation.receiverAddress = typeof receiverAddress === 'string' ? receiverAddress.trim() || null : null;
      }
    }

    // Update donation: assign to receiver and change status to 'assigned'
    donation.assignedReceiverId = receiverId;
    donation.status = 'assigned';
    await donation.save();

    console.log('[Donations] Donation claimed successfully:', {
      donationId: donation._id,
      trackingId: donation.trackingId,
      receiverId: receiverId,
      status: donation.status,
    });

    // Fetch receiver details for email
    const receiver = await User.findById(receiverId).select('-password');
    
    // Fetch donor details for email
    const donor = await User.findById(donation.donorId).select('-password');

    // Send email notifications (async, don't block response)
    const { 
      sendDonationClaimedEmail,
      sendDonationAvailableNotificationToDrivers 
    } = require('../utils/emailService');
    
    // Send email to donor
    sendDonationClaimedEmail(donation, donor, receiver)
      .catch(error => {
        console.error('[Donations] Error sending claim notification email to donor:', error.message);
        // Don't fail claim if email fails
      });

    // Send email to all active drivers about the new pickup opportunity
    sendDonationAvailableNotificationToDrivers(donation, donor, receiver)
      .catch(error => {
        console.error('[Donations] Error sending donation available notification to drivers:', error.message);
        // Don't fail claim if email fails
      });

    // Notify all connected drivers so Delivery page can refetch
    socketService.emitToRole('Driver', 'donation_claimed', { donationId: donation._id.toString() });

    // Populate donor and receiver info for response
    await donation.populate('donorId', 'address email donorType username businessName');
    await donation.populate('assignedReceiverId', 'receiverName receiverType email');

    res.status(200).json({
      success: true,
      message: 'Donation claimed successfully',
      donation: {
        id: donation._id,
        trackingId: donation.trackingId,
        foodCategory: donation.foodCategory,
        itemName: donation.itemName,
        quantity: donation.quantity,
        status: donation.status,
        assignedReceiverId: donation.assignedReceiverId,
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Donations] Error claiming donation:', error);
    console.error('[Donations] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to claim donation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/donations/my-claims
 * Get all donations claimed by the authenticated receiver
 * Requires authentication (Receiver role)
 */
router.get('/my-claims', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Receiver
    if (req.user.role !== 'Receiver') {
      return res.status(403).json({
        success: false,
        message: 'Only receivers can view their claims',
      });
    }

    const receiverId = req.user.id;

    // Fetch all donations claimed by this receiver
    const donations = await Donation.find({
      assignedReceiverId: receiverId,
    })
      .populate('donorId', 'address email donorType username businessName')
      .populate('assignedDriverId', 'driverName vehicleNumber vehicleType')
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Format donations for frontend
    const formattedDonations = donations.map(donation => {
      const donor = donation.donorId;
      const donorName = donor?.donorType === 'Business' 
        ? donor.businessName 
        : donor?.username || donor?.email || 'Anonymous';

      return {
        id: donation._id.toString(),
        trackingId: donation.trackingId,
        // Food details
        itemName: donation.itemName,
        foodCategory: donation.foodCategory,
        quantity: donation.quantity,
        imageUrl: donation.imageUrl,
        expiryDate: donation.expiryDate,
        storageRecommendation: donation.storageRecommendation,
        // Donor details
        donorId: donation.donorId?._id?.toString(),
        donorAddress: donation.donorAddress || donor?.address || '',
        donorEmail: donation.donorEmail || donor?.email,
        donorName: donorName,
        donorType: donor?.donorType,
        // Driver details (if assigned)
        assignedDriverId: donation.assignedDriverId?._id?.toString(),
        driverName: donation.assignedDriverId?.driverName,
        vehicleNumber: donation.assignedDriverId?.vehicleNumber,
        // Status and assignment
        status: donation.status,
        // Pickup information
        preferredPickupDate: donation.preferredPickupDate,
        preferredPickupTimeFrom: donation.preferredPickupTimeFrom,
        preferredPickupTimeTo: donation.preferredPickupTimeTo,
        actualPickupDate: donation.actualPickupDate,
        // AI analysis data
        aiQualityScore: donation.aiQualityScore,
        aiFreshness: donation.aiFreshness,
        aiConfidence: donation.aiConfidence,
        aiDetectedItems: donation.aiDetectedItems || [],
        // Timestamps
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt,
      };
    });

    console.log(`[Donations] Returning ${formattedDonations.length} claimed donations for receiver ${receiverId}`);

    res.status(200).json({
      success: true,
      donations: formattedDonations,
      count: formattedDonations.length,
    });
  } catch (error) {
    console.error('[Donations] Error fetching receiver claims:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your claims',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/active-deliveries
 * Get all active deliveries for the authenticated driver (status: 'picked_up')
 * Requires authentication (Driver role)
 */
router.get('/active-deliveries', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Driver
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can view active deliveries',
      });
    }

    const driverId = req.user.id;
    const currentDate = new Date();

    // Fetch donations assigned to this driver: on the way to pickup (assigned) or to receiver (picked_up)
    const donations = await Donation.find({
      assignedDriverId: driverId,
      status: { $in: ['assigned', 'picked_up'] },
      expiryDate: { $gt: currentDate },
    })
      .populate('donorId', 'address email donorType username businessName')
      .populate('assignedReceiverId', 'address email receiverName receiverType')
      .sort({ updatedAt: -1 })
      .lean();

    // Import distance service
    const { calculateDistance, formatDistance, getRouteDistanceKm } = require('../utils/distanceService');
    const { geocodeAddress } = require('../services/geocodingService');

    // Get driver's current location
    const driver = await User.findById(driverId).select('driverLatitude driverLongitude');
    const driverLat = driver?.driverLatitude;
    const driverLng = driver?.driverLongitude;

    // Format deliveries and calculate distances (route distance along roads, fallback to straight-line)
    const formattedDeliveries = await Promise.all(
      donations.map(async (donation) => {
        const donor = donation.donorId;
        const receiver = donation.assignedReceiverId;

        // Get donor name
        const donorName = donor?.donorType === 'Business' 
          ? donor.businessName 
          : donor?.username || donor?.email || 'Anonymous';

        // Get receiver name
        const receiverName = receiver?.receiverName || receiver?.email || 'Receiver';

        // Get receiver coordinates: prefer donation-level (set at claim) else geocode receiver address
        let receiverLat = donation.receiverLatitude ?? null;
        let receiverLng = donation.receiverLongitude ?? null;
        if ((receiverLat == null || receiverLng == null) && receiver?.address) {
          const receiverCoords = await geocodeAddress(receiver.address);
          if (receiverCoords) {
            receiverLat = receiverCoords.lat;
            receiverLng = receiverCoords.lng;
          }
        }

        // Route distance driver → receiver (along roads; fallback to straight-line)
        let driverToReceiverDistance = null;
        if (driverLat && driverLng && receiverLat && receiverLng) {
          driverToReceiverDistance = await getRouteDistanceKm(driverLat, driverLng, receiverLat, receiverLng);
          if (driverToReceiverDistance == null) {
            driverToReceiverDistance = calculateDistance(driverLat, driverLng, receiverLat, receiverLng);
          }
        }

        // Route distance driver → donor (for assigned / not yet picked up)
        const donorLat = donation.donorLatitude;
        const donorLng = donation.donorLongitude;
        let driverToDonorDistance = null;
        if (driverLat && driverLng && donorLat && donorLng) {
          driverToDonorDistance = await getRouteDistanceKm(driverLat, driverLng, donorLat, donorLng);
          if (driverToDonorDistance == null) {
            driverToDonorDistance = calculateDistance(driverLat, driverLng, donorLat, donorLng);
          }
        }

        // Calculate time until expiry
        const expiryDate = new Date(donation.expiryDate);
        const timeUntilExpiry = expiryDate - currentDate;
        const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
        const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));

        let expiryText = 'Expired';
        if (timeUntilExpiry > 0) {
          if (hoursUntilExpiry > 0) {
            expiryText = `Expires in ${hoursUntilExpiry} ${hoursUntilExpiry === 1 ? 'hour' : 'hours'}`;
            if (minutesUntilExpiry > 0 && hoursUntilExpiry < 24) {
              expiryText += ` ${minutesUntilExpiry} ${minutesUntilExpiry === 1 ? 'min' : 'mins'}`;
            }
          } else {
            expiryText = `Expires in ${minutesUntilExpiry} ${minutesUntilExpiry === 1 ? 'min' : 'mins'}`;
          }
        }

        return {
          id: donation._id.toString(),
          status: donation.status,
          trackingId: donation.trackingId,
          // Food details
          itemName: donation.itemName,
          foodCategory: donation.foodCategory,
          quantity: donation.quantity,
          imageUrl: donation.imageUrl,
          expiryDate: donation.expiryDate,
          expiryText: expiryText,
          storageRecommendation: donation.storageRecommendation,
          // Donor details
          donorId: donation.donorId?._id?.toString(),
          donorName: donorName,
          donorAddress: donation.donorAddress || donor?.address || '',
          donorEmail: donation.donorEmail || donor?.email,
          donorType: donor?.donorType,
          donorLatitude: donation.donorLatitude,
          donorLongitude: donation.donorLongitude,
          // Receiver details
          receiverId: donation.assignedReceiverId?._id?.toString(),
          receiverName: receiverName,
          receiverAddress: donation.receiverAddress || receiver?.address || '',
          receiverEmail: receiver?.email,
          receiverType: receiver?.receiverType,
          receiverLatitude: receiverLat,
          receiverLongitude: receiverLng,
          // Distances
          driverToReceiverDistance: driverToReceiverDistance,
          driverToReceiverDistanceFormatted: formatDistance(driverToReceiverDistance),
          driverToDonorDistance: driverToDonorDistance,
          driverToDonorDistanceFormatted: formatDistance(driverToDonorDistance),
          // Pickup information
          actualPickupDate: donation.actualPickupDate,
          // Timestamps
          createdAt: donation.createdAt,
          updatedAt: donation.updatedAt,
        };
      })
    );

    console.log(`[Donations] Returning ${formattedDeliveries.length} active deliveries for driver ${driverId}`);

    res.status(200).json({
      success: true,
      deliveries: formattedDeliveries,
      count: formattedDeliveries.length,
      driverLocation: driverLat && driverLng ? {
        latitude: driverLat,
        longitude: driverLng,
      } : null,
    });
  } catch (error) {
    console.error('[Donations] Error fetching active deliveries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active deliveries',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/donor-statistics
 * Get donor statistics (delivered donations count and badge progress)
 * Requires authentication (Donor role)
 */
router.get('/donor-statistics', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Donor') {
      return res.status(403).json({
        success: false,
        message: 'Only donors can view their statistics',
      });
    }

    const donorId = req.user.id;
    const totalDonationsDelivered = await Donation.countDocuments({
      donorId,
      status: 'delivered',
    });

    const badgeProgress = getBadgeProgress(totalDonationsDelivered, DONOR_MILESTONES, DONOR_BADGE_NAMES);

    res.status(200).json({
      success: true,
      statistics: {
        totalDonationsDelivered,
        badgeProgress: {
          currentBadge: badgeProgress.currentBadge,
          currentBadgeKey: badgeProgress.currentBadgeKey,
          nextBadge: badgeProgress.nextBadge,
          nextMilestone: badgeProgress.nextMilestone,
          remaining: badgeProgress.remaining,
          timeline: badgeProgress.timeline,
        },
      },
    });
  } catch (error) {
    console.error('[Donations] Error fetching donor statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donor statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/driver-statistics
 * Get driver statistics (deliveries completed, distance travelled, etc.)
 * Requires authentication (Driver role)
 */
router.get('/driver-statistics', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Driver
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can view their statistics',
      });
    }

    const driverId = req.user.id;
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get all delivered donations for this driver
    const allDelivered = await Donation.find({
      assignedDriverId: driverId,
      status: 'delivered',
    })
      .populate('donorId', 'address')
      .populate('assignedReceiverId', 'address')
      .lean();

    // Get current month deliveries
    const currentMonthDelivered = allDelivered.filter(d => 
      new Date(d.updatedAt) >= startOfCurrentMonth
    );

    // Get last month deliveries
    const lastMonthDelivered = allDelivered.filter(d => {
      const updatedDate = new Date(d.updatedAt);
      return updatedDate >= startOfLastMonth && updatedDate < endOfLastMonth;
    });

    // Import distance and geocoding services
    const { calculateDistance, formatDistance } = require('../utils/distanceService');
    const { geocodeAddress } = require('../services/geocodingService');

    // Calculate total distance travelled
    let totalDistance = 0;
    for (const donation of allDelivered) {
      let donorLat = donation.donorLatitude;
      let donorLng = donation.donorLongitude;
      let receiverLat = null;
      let receiverLng = null;

      // Get donor coordinates
      if (!donorLat || !donorLng) {
        if (donation.donorAddress || donation.donorId?.address) {
          const coords = await geocodeAddress(donation.donorAddress || donation.donorId?.address);
          if (coords) {
            donorLat = coords.lat;
            donorLng = coords.lng;
          }
        }
      }

      // Get receiver coordinates
      if (donation.assignedReceiverId?.address) {
        const coords = await geocodeAddress(donation.assignedReceiverId.address);
        if (coords) {
          receiverLat = coords.lat;
          receiverLng = coords.lng;
        }
      }

      // Calculate distance if both coordinates available
      if (donorLat && donorLng && receiverLat && receiverLng) {
        const distance = calculateDistance(donorLat, donorLng, receiverLat, receiverLng);
        totalDistance += distance;
      }
    }

    // Calculate current month distance
    let currentMonthDistance = 0;
    for (const donation of currentMonthDelivered) {
      let donorLat = donation.donorLatitude;
      let donorLng = donation.donorLongitude;
      let receiverLat = null;
      let receiverLng = null;

      if (!donorLat || !donorLng) {
        if (donation.donorAddress || donation.donorId?.address) {
          const coords = await geocodeAddress(donation.donorAddress || donation.donorId?.address);
          if (coords) {
            donorLat = coords.lat;
            donorLng = coords.lng;
          }
        }
      }

      if (donation.assignedReceiverId?.address) {
        const coords = await geocodeAddress(donation.assignedReceiverId.address);
        if (coords) {
          receiverLat = coords.lat;
          receiverLng = coords.lng;
        }
      }

      if (donorLat && donorLng && receiverLat && receiverLng) {
        const distance = calculateDistance(donorLat, donorLng, receiverLat, receiverLng);
        currentMonthDistance += distance;
      }
    }

    // Calculate last month distance
    let lastMonthDistance = 0;
    for (const donation of lastMonthDelivered) {
      let donorLat = donation.donorLatitude;
      let donorLng = donation.donorLongitude;
      let receiverLat = null;
      let receiverLng = null;

      if (!donorLat || !donorLng) {
        if (donation.donorAddress || donation.donorId?.address) {
          const coords = await geocodeAddress(donation.donorAddress || donation.donorId?.address);
          if (coords) {
            donorLat = coords.lat;
            donorLng = coords.lng;
          }
        }
      }

      if (donation.assignedReceiverId?.address) {
        const coords = await geocodeAddress(donation.assignedReceiverId.address);
        if (coords) {
          receiverLat = coords.lat;
          receiverLng = coords.lng;
        }
      }

      if (donorLat && donorLng && receiverLat && receiverLng) {
        const distance = calculateDistance(donorLat, donorLng, receiverLat, receiverLng);
        lastMonthDistance += distance;
      }
    }

    // Calculate trends
    const deliveriesTrend = lastMonthDelivered.length > 0
      ? ((currentMonthDelivered.length - lastMonthDelivered.length) / lastMonthDelivered.length * 100).toFixed(0)
      : (currentMonthDelivered.length > 0 ? 100 : 0);

    const distanceTrend = lastMonthDistance > 0
      ? ((currentMonthDistance - lastMonthDistance) / lastMonthDistance * 100).toFixed(0)
      : (currentMonthDistance > 0 ? 100 : 0);

    const totalDeliveries = allDelivered.length;
    const badgeProgress = getBadgeProgress(totalDeliveries, DRIVER_MILESTONES, DRIVER_BADGE_NAMES);
    const nextMilestone = badgeProgress.nextMilestone;
    const progressPercentage = nextMilestone != null && totalDeliveries < nextMilestone
      ? (totalDeliveries / nextMilestone * 100).toFixed(0)
      : totalDeliveries >= 100 ? 100 : 0;

    console.log(`[Donations] Returning statistics for driver ${driverId}`);

    res.status(200).json({
      success: true,
      statistics: {
        totalDeliveriesCompleted: totalDeliveries,
        totalDistanceTravelled: totalDistance,
        totalDistanceTravelledFormatted: formatDistance(totalDistance),
        currentMonthDeliveries: currentMonthDelivered.length,
        currentMonthDistance: currentMonthDistance,
        currentMonthDistanceFormatted: formatDistance(currentMonthDistance),
        deliveriesTrend: parseFloat(deliveriesTrend),
        distanceTrend: parseFloat(distanceTrend),
        impactProgress: {
          badgeLevel: badgeProgress.currentBadge || 'None',
          progressPercentage: parseFloat(progressPercentage),
          currentCount: totalDeliveries,
          nextBadgeTarget: nextMilestone,
          remainingForNextBadge: badgeProgress.remaining,
        },
        badgeProgress: {
          currentBadge: badgeProgress.currentBadge,
          currentBadgeKey: badgeProgress.currentBadgeKey,
          nextBadge: badgeProgress.nextBadge,
          nextMilestone: badgeProgress.nextMilestone,
          remaining: badgeProgress.remaining,
          timeline: badgeProgress.timeline,
        },
      },
    });
  } catch (error) {
    console.error('[Donations] Error fetching driver statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch driver statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/driver-completed
 * Get all completed deliveries for the authenticated driver
 * Requires authentication (Driver role)
 */
router.get('/driver-completed', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Driver
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can view their completed deliveries',
      });
    }

    const driverId = req.user.id;

    // Fetch all delivered donations for this driver
    const donations = await Donation.find({
      assignedDriverId: driverId,
      status: 'delivered',
    })
      .populate('donorId', 'address email donorType username businessName')
      .populate('assignedReceiverId', 'receiverName receiverType email address')
      .sort({ updatedAt: -1 }) // Most recently delivered first
      .lean();

    // Format donations for frontend
    const formattedDonations = donations.map(donation => {
      const donor = donation.donorId;
      const receiver = donation.assignedReceiverId;

      const donorName = donor?.donorType === 'Business' 
        ? donor.businessName 
        : donor?.username || donor?.email || 'Anonymous';

      const receiverName = receiver?.receiverName || receiver?.email || 'Receiver';

      return {
        id: donation._id.toString(),
        trackingId: donation.trackingId,
        itemName: donation.itemName,
        quantity: donation.quantity,
        imageUrl: donation.imageUrl,
        donorName,
        donorAddress: donation.donorAddress || donor?.address || '',
        receiverName,
        receiverAddress: donation.receiverAddress || receiver?.address || '',
        deliveredAt: donation.updatedAt, // Use updatedAt as delivery date
        createdAt: donation.createdAt,
      };
    });

    console.log(`[Donations] Returning ${formattedDonations.length} completed deliveries for driver ${driverId}`);

    res.status(200).json({
      success: true,
      deliveries: formattedDonations,
      count: formattedDonations.length,
    });
  } catch (error) {
    console.error('[Donations] Error fetching driver completed deliveries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch completed deliveries',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/my-donations
 * Get all donations created by the authenticated donor
 * Requires authentication (Donor role)
 */
router.get('/my-donations', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Donor
    if (req.user.role !== 'Donor') {
      return res.status(403).json({
        success: false,
        message: 'Only donors can view their donations',
      });
    }

    const donorId = req.user.id;

    // Fetch all donations created by this donor
    const donations = await Donation.find({
      donorId: donorId,
    })
      .populate('assignedReceiverId', 'receiverName receiverType email address')
      .populate('assignedDriverId', 'driverName vehicleNumber vehicleType')
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Format donations for frontend
    const formattedDonations = donations.map(donation => {
      const receiver = donation.assignedReceiverId;
      const driver = donation.assignedDriverId;

      return {
        id: donation._id.toString(),
        trackingId: donation.trackingId,
        // Food details
        itemName: donation.itemName,
        foodCategory: donation.foodCategory,
        quantity: donation.quantity,
        imageUrl: donation.imageUrl,
        expiryDate: donation.expiryDate,
        storageRecommendation: donation.storageRecommendation,
        // Receiver details (if assigned)
        assignedReceiverId: donation.assignedReceiverId?._id?.toString(),
        receiverName: receiver?.receiverName,
        receiverType: receiver?.receiverType,
        receiverEmail: receiver?.email,
        receiverAddress: donation.receiverAddress || receiver?.address || '',
        // Driver details (if assigned)
        assignedDriverId: donation.assignedDriverId?._id?.toString(),
        driverName: driver?.driverName,
        vehicleNumber: driver?.vehicleNumber,
        vehicleType: driver?.vehicleType,
        // Status and assignment
        status: donation.status,
        // Pickup information
        preferredPickupDate: donation.preferredPickupDate,
        preferredPickupTimeFrom: donation.preferredPickupTimeFrom,
        preferredPickupTimeTo: donation.preferredPickupTimeTo,
        actualPickupDate: donation.actualPickupDate,
        // AI analysis data
        aiQualityScore: donation.aiQualityScore,
        aiFreshness: donation.aiFreshness,
        aiConfidence: donation.aiConfidence,
        aiDetectedItems: donation.aiDetectedItems || [],
        // Timestamps
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt,
      };
    });

    console.log(`[Donations] Returning ${formattedDonations.length} donations for donor ${donorId}`);

    res.status(200).json({
      success: true,
      donations: formattedDonations,
      count: formattedDonations.length,
    });
  } catch (error) {
    console.error('[Donations] Error fetching donor donations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your donations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/available-pickups
 * Get all available pickups for drivers
 * Returns donations with status 'assigned' that have been claimed by receivers
 * Requires authentication (Driver role)
 */
router.get('/available-pickups', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Driver
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can view available pickups',
      });
    }

    const driverId = req.user.id;
    const currentDate = new Date();
    const MAX_TOTAL_ROUTE_KM = 40;

    // Get driver's current location
    const driver = await User.findById(driverId).select('driverLatitude driverLongitude');
    const driverLat = driver?.driverLatitude;
    const driverLng = driver?.driverLongitude;

    // Fetch donations that are assigned to receivers but have no driver yet (order available list)
    const donations = await Donation.find({
      status: 'assigned',
      assignedReceiverId: { $ne: null },
      assignedDriverId: null, // Exclude once a driver has picked/claimed the order
      expiryDate: { $gt: currentDate }, // Only non-expired donations
    })
      .populate('donorId', 'address email donorType username businessName')
      .populate('assignedReceiverId', 'address email receiverName receiverType')
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Import distance service (route distance along roads, fallback to straight-line)
    const { calculateDistance, formatDistance, getRouteDistanceKm } = require('../utils/distanceService');
    const { geocodeAddress } = require('../services/geocodingService');

    // Format pickups and calculate distances
    const formattedPickups = await Promise.all(
      donations.map(async (donation) => {
        const donor = donation.donorId;
        const receiver = donation.assignedReceiverId;

        // Get donor name
        const donorName = donor?.donorType === 'Business' 
          ? donor.businessName 
          : donor?.username || donor?.email || 'Anonymous';

        // Get receiver name
        const receiverName = receiver?.receiverName || receiver?.email || 'Receiver';

        // Get donor coordinates
        let donorLat = donation.donorLatitude;
        let donorLng = donation.donorLongitude;

        // If donor coordinates are missing, try to geocode
        if ((!donorLat || !donorLng) && donation.donorAddress) {
          const coords = await geocodeAddress(donation.donorAddress);
          if (coords) {
            donorLat = coords.lat;
            donorLng = coords.lng;
            // Save coordinates back to database (async, don't block response)
            Donation.findByIdAndUpdate(
              donation._id,
              { donorLatitude: coords.lat, donorLongitude: coords.lng },
              { new: true }
            ).catch(err => {
              console.error(`[Donations] Error saving donor coordinates: ${err}`);
            });
          }
        }

        // Get receiver coordinates: use confirmed claim location first, else geocode address
        let receiverLat = donation.receiverLatitude ?? null;
        let receiverLng = donation.receiverLongitude ?? null;
        const receiverAddressForGeocode = donation.receiverAddress || receiver?.address;
        if ((!receiverLat || !receiverLng) && receiverAddressForGeocode) {
          const receiverCoords = await geocodeAddress(receiverAddressForGeocode);
          if (receiverCoords) {
            receiverLat = receiverLat ?? receiverCoords.lat;
            receiverLng = receiverLng ?? receiverCoords.lng;
          }
        }

        // Route distances along roads (OSRM); fallback to straight-line (Haversine)
        let driverToDonorDistance = null;
        let donorToReceiverDistance = null;
        let totalRouteDistance = null;

        if (driverLat && driverLng && donorLat && donorLng) {
          driverToDonorDistance = await getRouteDistanceKm(driverLat, driverLng, donorLat, donorLng);
          if (driverToDonorDistance == null) {
            driverToDonorDistance = calculateDistance(driverLat, driverLng, donorLat, donorLng);
          }
        }

        if (donorLat && donorLng && receiverLat && receiverLng) {
          donorToReceiverDistance = await getRouteDistanceKm(donorLat, donorLng, receiverLat, receiverLng);
          if (donorToReceiverDistance == null) {
            donorToReceiverDistance = calculateDistance(donorLat, donorLng, receiverLat, receiverLng);
          }
        }

        if (driverToDonorDistance !== null && donorToReceiverDistance !== null) {
          totalRouteDistance = driverToDonorDistance + donorToReceiverDistance;
        }

        // Calculate time until expiry
        const expiryDate = new Date(donation.expiryDate);
        const timeUntilExpiry = expiryDate - currentDate;
        const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
        const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));

        let expiryText = 'Expired';
        if (timeUntilExpiry > 0) {
          if (hoursUntilExpiry > 0) {
            expiryText = `Expires in ${hoursUntilExpiry} ${hoursUntilExpiry === 1 ? 'hour' : 'hours'}`;
            if (minutesUntilExpiry > 0 && hoursUntilExpiry < 24) {
              expiryText += ` ${minutesUntilExpiry} ${minutesUntilExpiry === 1 ? 'min' : 'mins'}`;
            }
          } else {
            expiryText = `Expires in ${minutesUntilExpiry} ${minutesUntilExpiry === 1 ? 'min' : 'mins'}`;
          }
        }

        return {
          id: donation._id.toString(),
          trackingId: donation.trackingId,
          // Food details
          itemName: donation.itemName,
          foodCategory: donation.foodCategory,
          quantity: donation.quantity,
          imageUrl: donation.imageUrl,
          expiryDate: donation.expiryDate,
          expiryText: expiryText,
          storageRecommendation: donation.storageRecommendation,
          // Donor details
          donorId: donation.donorId?._id?.toString(),
          donorName: donorName,
          donorAddress: donation.donorAddress || donor?.address || '',
          donorEmail: donation.donorEmail || donor?.email,
          donorType: donor?.donorType,
          donorLatitude: donorLat,
          donorLongitude: donorLng,
          // Receiver details (use confirmed delivery address from claim, not signup address)
          receiverId: donation.assignedReceiverId?._id?.toString(),
          receiverName: receiverName,
          receiverAddress: donation.receiverAddress || receiver?.address || '',
          receiverEmail: receiver?.email,
          receiverType: receiver?.receiverType,
          receiverLatitude: receiverLat,
          receiverLongitude: receiverLng,
          // Distances
          driverToDonorDistance: driverToDonorDistance,
          driverToDonorDistanceFormatted: formatDistance(driverToDonorDistance),
          donorToReceiverDistance: donorToReceiverDistance,
          donorToReceiverDistanceFormatted: formatDistance(donorToReceiverDistance),
          totalRouteDistance: totalRouteDistance,
          totalRouteDistanceFormatted: formatDistance(totalRouteDistance),
          // Pickup information
          preferredPickupDate: donation.preferredPickupDate,
          preferredPickupTimeFrom: donation.preferredPickupTimeFrom,
          preferredPickupTimeTo: donation.preferredPickupTimeTo,
          // Timestamps
          createdAt: donation.createdAt,
          updatedAt: donation.updatedAt,
        };
      })
    );

    // Show only pickups within 40 km after driver has added their location
    let filteredPickups = formattedPickups;
    if (!driverLat || !driverLng) {
      filteredPickups = [];
    } else {
      filteredPickups = formattedPickups.filter(
        (p) => p.totalRouteDistance != null && p.totalRouteDistance <= MAX_TOTAL_ROUTE_KM
      );
    }

    console.log(`[Donations] Returning ${filteredPickups.length} available pickups for driver ${driverId}`);

    res.status(200).json({
      success: true,
      pickups: filteredPickups,
      count: filteredPickups.length,
      driverLocation: driverLat && driverLng ? {
        latitude: driverLat,
        longitude: driverLng,
      } : null,
    });
  } catch (error) {
    console.error('[Donations] Error fetching available pickups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available pickups',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/:id
 * Get a single donation by ID (donor must own it) - for edit form
 */
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Donor') {
      return res.status(403).json({ success: false, message: 'Only donors can view donation details' });
    }
    const donation = await Donation.findOne({
      _id: req.params.id,
      donorId: req.user.id,
    }).lean();
    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }
    const d = donation;
    const preferredPickupDate = d.preferredPickupDate ? new Date(d.preferredPickupDate).toISOString().split('T')[0] : null;
    const expiryDate = d.expiryDate ? new Date(d.expiryDate).toISOString().split('T')[0] : null;
    res.status(200).json({
      success: true,
      donation: {
        id: d._id.toString(),
        trackingId: d.trackingId,
        foodCategory: d.foodCategory,
        itemName: d.itemName,
        quantity: d.quantity,
        storageRecommendation: d.storageRecommendation,
        imageUrl: d.imageUrl,
        preferredPickupDate,
        preferredPickupTimeFrom: d.preferredPickupTimeFrom,
        preferredPickupTimeTo: d.preferredPickupTimeTo,
        expiryDate,
        expiryDateFromPackage: d.expiryDateFromPackage,
        donorLatitude: d.donorLatitude,
        donorLongitude: d.donorLongitude,
        status: d.status,
        aiConfidence: d.aiConfidence,
        aiQualityScore: d.aiQualityScore,
        aiFreshness: d.aiFreshness,
        aiDetectedItems: d.aiDetectedItems || [],
        productType: d.productType,
      },
    });
  } catch (error) {
    console.error('[Donations] Error fetching donation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/:id/donor-receipt-view
 * Get donation + impact receipt for donor digital receipt page (donor only, delivered donations)
 */
router.get('/:id/donor-receipt-view', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Donor') {
      return res.status(403).json({ success: false, message: 'Only donors can view receipt' });
    }
    const { id } = req.params;
    const donorId = req.user.id;

    const donation = await Donation.findOne({
      _id: id,
      donorId,
      status: 'delivered',
    })
      .populate('assignedReceiverId', 'receiverName receiverType email address')
      .populate('assignedDriverId', 'driverName vehicleNumber vehicleType profileImageUrl')
      .lean();

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found or not delivered',
      });
    }

    const receipt = await ImpactReceipt.findOne({ donationId: id }).lean();

    const donor = await User.findById(donorId)
      .select('email donorType username businessName address')
      .lean();
    const donorName = donor?.donorType === 'Business'
      ? donor?.businessName
      : donor?.username || donor?.email || 'Donor';
    const receiver = donation.assignedReceiverId;
    const receiverName = receiver?.receiverName || receiver?.email || 'Receiver';
    const driver = donation.assignedDriverId;
    const driverName = driver?.driverName || 'Driver';

    const deliveryDate = donation.updatedAt || donation.actualPickupDate || donation.createdAt;
    const formattedDeliveryDate = deliveryDate
      ? new Date(deliveryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : null;

    res.status(200).json({
      success: true,
      donation: {
        id: donation._id.toString(),
        trackingId: donation.trackingId,
        itemName: donation.itemName,
        quantity: donation.quantity,
        imageUrl: donation.imageUrl,
        foodCategory: donation.foodCategory,
        storageRecommendation: donation.storageRecommendation,
      },
      donor: {
        name: donorName,
        email: donor?.email || '',
        address: donation.donorAddress || donor?.address || '',
      },
      receiver: {
        name: receiverName,
        type: receiver?.receiverType || '',
        address: donation.receiverAddress || receiver?.address || '',
      },
      driver: driver ? {
        name: driverName,
        vehicleNumber: driver.vehicleNumber || '',
        vehicleType: driver.vehicleType || '',
        profileImageUrl: driver.profileImageUrl || null,
      } : null,
      deliveryDate: formattedDeliveryDate,
      receipt: receipt ? {
        id: receipt._id.toString(),
        dropLocation: receipt.dropLocation,
        peopleFed: receipt.peopleFed,
        weightPerServing: receipt.weightPerServing,
        distanceTraveled: receipt.distanceTraveled,
        methaneSaved: receipt.methaneSaved,
        createdAt: receipt.createdAt,
      } : null,
    });
  } catch (error) {
    console.error('[Donations] Error fetching donor receipt view:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch receipt data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/:id/donor-receipt-pdf
 * Get PDF receipt for a donation (donor only - for their delivered donation)
 */
router.get('/:id/donor-receipt-pdf', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Donor') {
      return res.status(403).json({ success: false, message: 'Only donors can access receipt PDF' });
    }
    const { id } = req.params;
    const donorId = req.user.id;

    const donation = await Donation.findOne({
      _id: id,
      donorId,
      status: 'delivered',
    }).lean();
    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found or not delivered',
      });
    }

    const receipt = await ImpactReceipt.findOne({ donationId: id }).lean();
    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: 'Impact receipt not yet created for this donation',
      });
    }

    const donationFull = await Donation.findById(id)
      .populate('donorId', 'email donorType username businessName address')
      .populate('assignedReceiverId', 'receiverName receiverType email address')
      .populate('assignedDriverId', 'driverName vehicleNumber vehicleType')
      .lean();
    const donorName = donationFull.donorId?.donorType === 'Business'
      ? donationFull.donorId?.businessName
      : donationFull.donorId?.username || donationFull.donorId?.email || 'Anonymous';
    const receiverName = donationFull.assignedReceiverId?.receiverName || donationFull.assignedReceiverId?.email || 'Receiver';
    const driverName = donationFull.assignedDriverId?.driverName || 'Driver';
    const deliveryDate = new Date(donationFull.updatedAt || donationFull.actualPickupDate || donationFull.createdAt)
      .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const donationData = {
      trackingId: donationFull.trackingId,
      donor: { name: donorName, email: donationFull.donorId?.email || '', address: donationFull.donorAddress || donationFull.donorId?.address || '', donorType: donationFull.donorId?.donorType || 'Individual' },
      receiver: { receiverName: receiverName, receiverType: donationFull.assignedReceiverId?.receiverType || '', address: donationFull.receiverAddress || donationFull.assignedReceiverId?.address || '' },
      driver: donationFull.assignedDriverId ? { driverName: driverName, vehicleNumber: donationFull.assignedDriverId.vehicleNumber || '', vehicleType: donationFull.assignedDriverId.vehicleType || '' } : null,
      donation: { itemName: donationFull.itemName, quantity: donationFull.quantity, foodCategory: donationFull.foodCategory, storageRecommendation: donationFull.storageRecommendation },
      deliveryDate,
    };
    const pdfBuffer = await generateImpactReceiptPDF(receipt, donationData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="impact-receipt-${donationFull.trackingId || id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[Donations] Error generating donor receipt PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate receipt PDF',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * PATCH /api/donations/:id
 * Update a donation (donor only, only when pending/approved or assigned without driver)
 */
router.patch('/:id', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Donor') {
      return res.status(403).json({ success: false, message: 'Only donors can update donations' });
    }
    const donation = await Donation.findOne({
      _id: req.params.id,
      donorId: req.user.id,
    });
    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }
    const canEdit = donation.status === 'pending' || donation.status === 'approved' ||
      (donation.status === 'assigned' && !donation.assignedDriverId);
    if (!canEdit) {
      return res.status(400).json({
        success: false,
        message: 'This donation can no longer be edited (driver already assigned or delivered)',
      });
    }
    const {
      foodCategory,
      itemName,
      quantity,
      storageRecommendation,
      imageUrl,
      preferredPickupDate,
      preferredPickupTimeFrom,
      preferredPickupTimeTo,
      userProvidedExpiryDate,
      donorLatitude,
      donorLongitude,
    } = req.body;

    const validCategories = ['Cooked Meals', 'Raw Food', 'Beverages', 'Snacks', 'Desserts'];
    if (foodCategory != null && !validCategories.includes(foodCategory)) {
      return res.status(400).json({ success: false, errors: [{ field: 'foodCategory', message: 'Invalid food category' }] });
    }
    const validStorage = ['Hot', 'Cold', 'Dry'];
    if (storageRecommendation != null && !validStorage.includes(storageRecommendation)) {
      return res.status(400).json({ success: false, errors: [{ field: 'storageRecommendation', message: 'Invalid storage' }] });
    }
    if (quantity != null && (typeof quantity !== 'number' || quantity < 1)) {
      return res.status(400).json({ success: false, errors: [{ field: 'quantity', message: 'Quantity must be a positive number' }] });
    }

    if (foodCategory != null) donation.foodCategory = foodCategory;
    if (itemName != null) donation.itemName = itemName;
    if (quantity != null) donation.quantity = quantity;
    if (storageRecommendation != null) donation.storageRecommendation = storageRecommendation;
    if (imageUrl != null) donation.imageUrl = imageUrl;
    if (preferredPickupDate != null) donation.preferredPickupDate = new Date(preferredPickupDate);
    if (preferredPickupTimeFrom != null) donation.preferredPickupTimeFrom = preferredPickupTimeFrom;
    if (preferredPickupTimeTo != null) donation.preferredPickupTimeTo = preferredPickupTimeTo;
    if (userProvidedExpiryDate != null) donation.expiryDate = new Date(userProvidedExpiryDate);
    if (donorLatitude != null) donation.donorLatitude = donorLatitude;
    if (donorLongitude != null) donation.donorLongitude = donorLongitude;

    await donation.save();
    res.status(200).json({
      success: true,
      message: 'Donation updated successfully',
      donation: {
        id: donation._id,
        trackingId: donation.trackingId,
        status: donation.status,
      },
    });
  } catch (error) {
    console.error('[Donations] Error updating donation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update donation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * DELETE /api/donations/:id
 * Cancel a donation (donor only, only when pending/approved or assigned without driver)
 */
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Donor') {
      return res.status(403).json({ success: false, message: 'Only donors can cancel donations' });
    }
    const donation = await Donation.findOne({
      _id: req.params.id,
      donorId: req.user.id,
    });
    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }
    const canCancel = donation.status === 'pending' || donation.status === 'approved' ||
      (donation.status === 'assigned' && !donation.assignedDriverId);
    if (!canCancel) {
      return res.status(400).json({
        success: false,
        message: 'This donation can no longer be cancelled (driver already assigned or delivered)',
      });
    }
    donation.status = 'cancelled';
    await donation.save();
    res.status(200).json({
      success: true,
      message: 'Donation cancelled successfully',
    });
  } catch (error) {
    console.error('[Donations] Error cancelling donation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel donation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/donations/:id/accept-order
 * Driver accepts/claims an order from Available Pickups (before physical pickup).
 * Sets assignedDriverId, keeps status 'assigned'. Order then appears in driver's My Pickups In Transit.
 */
router.post('/:id/accept-order', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can accept orders',
      });
    }

    const { id } = req.params;
    const driverId = req.user.id;

    const donation = await Donation.findById(id);
    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    if (donation.assignedDriverId) {
      return res.status(400).json({
        success: false,
        message: 'This donation has already been assigned to another driver',
      });
    }

    if (donation.status !== 'assigned') {
      return res.status(400).json({
        success: false,
        message: `This donation cannot be accepted. Current status: ${donation.status}`,
      });
    }

    if (!donation.assignedReceiverId) {
      return res.status(400).json({
        success: false,
        message: 'This donation has not been claimed by a receiver yet',
      });
    }

    // Driver can only have one active order at a time (assigned or picked_up)
    const existingActiveCount = await Donation.countDocuments({
      assignedDriverId: driverId,
      status: { $in: ['assigned', 'picked_up'] },
    });
    if (existingActiveCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'You can only accept one order at a time. Complete your current delivery first.',
      });
    }

    const currentDate = new Date();
    if (donation.expiryDate <= currentDate) {
      return res.status(400).json({
        success: false,
        message: 'This donation has expired',
      });
    }

    donation.assignedDriverId = driverId;
    // Keep status 'assigned' - physical confirm-pickup will set 'picked_up'
    await donation.save();

    console.log('[Donations] Order accepted by driver:', {
      donationId: donation._id,
      driverId,
      status: donation.status,
    });

    // Notify donor and receiver so My Donation and My Claims can refetch (show in In Transit)
    const donorId = donation.donorId?.toString?.() || donation.donorId?.toString();
    const assignedReceiverId = donation.assignedReceiverId?._id?.toString?.() || donation.assignedReceiverId?.toString();
    const donationIdStr = donation._id.toString();
    if (donorId) socketService.emitToUser(donorId, 'donation_in_transit', { donationId: donationIdStr });
    if (assignedReceiverId) socketService.emitToUser(assignedReceiverId, 'donation_in_transit', { donationId: donationIdStr });

    await donation.populate('donorId', 'address email donorType username businessName');
    await donation.populate('assignedReceiverId', 'receiverName receiverType email address');
    await donation.populate('assignedDriverId', 'driverName vehicleNumber vehicleType');

    res.status(200).json({
      success: true,
      message: 'Order accepted. It now appears in your My Pickups In Transit.',
      donation: {
        id: donation._id,
        trackingId: donation.trackingId,
        status: donation.status,
        assignedDriverId: donation.assignedDriverId?._id?.toString(),
        driverName: donation.assignedDriverId?.driverName,
        assignedReceiverId: donation.assignedReceiverId?._id?.toString(),
        receiverName: donation.assignedReceiverId?.receiverName,
      },
    });
  } catch (error) {
    console.error('[Donations] Error accepting order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/donations/:id/confirm-pickup
 * Driver confirms physical pickup at donor (order must already be accepted by this driver).
 * Sets status to 'picked_up' and actualPickupDate.
 * Backward compatibility: if no driver assigned yet, assigns driver and sets picked_up in one call.
 */
router.post('/:id/confirm-pickup', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can confirm pickups',
      });
    }

    const { id } = req.params;
    const driverId = req.user.id;

    const donation = await Donation.findById(id);
    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    const alreadyAssignedToThisDriver = donation.assignedDriverId && donation.assignedDriverId.toString() === driverId;

    if (donation.assignedDriverId && !alreadyAssignedToThisDriver) {
      return res.status(400).json({
        success: false,
        message: 'This donation has already been assigned to another driver',
      });
    }

    if (donation.status !== 'assigned') {
      return res.status(400).json({
        success: false,
        message: `This donation cannot be picked up. Current status: ${donation.status}`,
      });
    }

    if (!donation.assignedReceiverId) {
      return res.status(400).json({
        success: false,
        message: 'This donation has not been claimed by a receiver yet',
      });
    }

    const currentDate = new Date();
    if (donation.expiryDate <= currentDate) {
      return res.status(400).json({
        success: false,
        message: 'This donation has expired and cannot be picked up',
      });
    }

    // Assign driver if not already (backward compatibility)
    if (!donation.assignedDriverId) {
      donation.assignedDriverId = driverId;
    }
    donation.status = 'picked_up';
    donation.actualPickupDate = new Date();
    await donation.save();

    console.log('[Donations] Pickup confirmed successfully:', {
      donationId: donation._id,
      trackingId: donation.trackingId,
      driverId: driverId,
      receiverId: donation.assignedReceiverId,
      status: donation.status,
    });

    // Fetch donor, receiver, and driver details for emails
    const donor = await User.findById(donation.donorId).select('-password');
    const receiver = await User.findById(donation.assignedReceiverId).select('-password');
    const driver = await User.findById(driverId).select('-password');

    if (!donor || !receiver || !driver) {
      console.error('[Donations] Missing user data for email notifications');
    }

    // Send email notifications (async, don't block response)
    const { 
      sendPickupConfirmedEmailToDonor, 
      sendPickupConfirmedEmailToReceiver 
    } = require('../utils/emailService');

    // Send email to donor
    if (donor) {
      sendPickupConfirmedEmailToDonor(donation, donor, driver)
        .catch(error => {
          console.error('[Donations] Error sending pickup confirmation email to donor:', error.message);
        });
    }

    // Send email to receiver
    if (receiver) {
      sendPickupConfirmedEmailToReceiver(donation, receiver, driver)
        .catch(error => {
          console.error('[Donations] Error sending pickup confirmation email to receiver:', error.message);
        });
    }

    // Populate donation details for response
    await donation.populate('donorId', 'address email donorType username businessName');
    await donation.populate('assignedReceiverId', 'receiverName receiverType email address');
    await donation.populate('assignedDriverId', 'driverName vehicleNumber vehicleType');

    res.status(200).json({
      success: true,
      message: 'Pickup confirmed successfully. Emails have been sent to donor and receiver.',
      donation: {
        id: donation._id,
        trackingId: donation.trackingId,
        status: donation.status,
        assignedDriverId: donation.assignedDriverId?._id?.toString(),
        driverName: donation.assignedDriverId?.driverName,
        assignedReceiverId: donation.assignedReceiverId?._id?.toString(),
        receiverName: donation.assignedReceiverId?.receiverName,
        actualPickupDate: donation.actualPickupDate,
      },
    });
  } catch (error) {
    console.error('[Donations] Error confirming pickup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm pickup',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/:id/tracking
 * Get real-time tracking data for a donation
 * Returns driver location, donation status, and location coordinates
 * No authentication required - donors and receivers need to track
 */
router.get('/:id/tracking', async (req, res) => {
  try {
    const { id } = req.params;

    // Find the donation
    const donation = await Donation.findById(id)
      .populate('donorId', 'address email donorType username businessName contactNo')
      .populate('assignedReceiverId', 'receiverName receiverType email address contactNo')
      .populate('assignedDriverId', 'driverName vehicleNumber vehicleType driverLatitude driverLongitude profileImageUrl')
      .lean();

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    // Get driver location if driver is assigned
    let driverLocation = null;
    if (donation.assignedDriverId) {
      const driver = donation.assignedDriverId;
      if (driver.driverLatitude && driver.driverLongitude) {
        driverLocation = {
          latitude: driver.driverLatitude,
          longitude: driver.driverLongitude,
        };
      }
    }

    // Get donor location
    const donorLocation = donation.donorLatitude && donation.donorLongitude
      ? {
          latitude: donation.donorLatitude,
          longitude: donation.donorLongitude,
        }
      : null;

    // Get receiver location: use confirmed claim coordinates first, else geocode address
    let receiverLocation = null;
    if (donation.receiverLatitude != null && donation.receiverLongitude != null) {
      receiverLocation = {
        latitude: donation.receiverLatitude,
        longitude: donation.receiverLongitude,
      };
    } else if (donation.assignedReceiverId) {
      const receiver = donation.assignedReceiverId;
      const addressToGeocode = donation.receiverAddress || receiver.address;
      if (addressToGeocode) {
        const { geocodeAddress } = require('../services/geocodingService');
        const coords = await geocodeAddress(addressToGeocode);
        if (coords) {
          receiverLocation = {
            latitude: coords.lat,
            longitude: coords.lng,
          };
        }
      }
    }

    // Format response
    const trackingData = {
      donation: {
        id: donation._id.toString(),
        trackingId: donation.trackingId,
        status: donation.status,
        itemName: donation.itemName,
        quantity: donation.quantity,
        imageUrl: donation.imageUrl,
      },
      donor: {
        id: donation.donorId?._id?.toString(),
        name: donation.donorId?.donorType === 'Business'
          ? donation.donorId?.businessName
          : donation.donorId?.username || donation.donorId?.email || 'Anonymous',
        address: donation.donorAddress || donation.donorId?.address || '',
        contactNo: donation.donorId?.contactNo || null,
        email: donation.donorId?.email || donation.donorEmail || null,
        location: donorLocation,
      },
      receiver: donation.assignedReceiverId ? {
        id: donation.assignedReceiverId._id?.toString(),
        name: donation.assignedReceiverId.receiverName || donation.assignedReceiverId.email || 'Receiver',
        address: donation.receiverAddress || donation.assignedReceiverId.address || '',
        contactNo: donation.assignedReceiverId.contactNo || null,
        location: receiverLocation,
      } : null,
      driver: donation.assignedDriverId ? {
        id: donation.assignedDriverId._id?.toString(),
        name: donation.assignedDriverId.driverName || 'Driver',
        vehicleNumber: donation.assignedDriverId.vehicleNumber,
        vehicleType: donation.assignedDriverId.vehicleType,
        profileImageUrl: donation.assignedDriverId.profileImageUrl || null,
        location: driverLocation,
      } : null,
      timestamps: {
        createdAt: donation.createdAt,
        actualPickupDate: donation.actualPickupDate,
        updatedAt: donation.updatedAt,
      },
    };

    console.log(`[Donations] Returning tracking data for donation ${id}`);

    res.status(200).json({
      success: true,
      tracking: trackingData,
    });
  } catch (error) {
    console.error('[Donations] Error fetching tracking data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tracking data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/donations/:id/confirm-delivery
 * Confirm delivery of a donation to receiver
 * Requires authentication (Driver role)
 * Changes status from 'picked_up' to 'delivered'
 */
router.post('/:id/confirm-delivery', authenticateUser, async (req, res) => {
  try {
    // Check if user is a Driver
    if (req.user.role !== 'Driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can confirm delivery',
      });
    }

    const { id } = req.params;
    const driverId = req.user.id;

    // Find the donation
    const donation = await Donation.findById(id);
    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    // Check if driver is assigned to this donation
    if (donation.assignedDriverId?.toString() !== driverId) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this donation',
      });
    }

    // Check if donation is in 'picked_up' status
    if (donation.status !== 'picked_up') {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm delivery. Current status: ${donation.status}. Delivery can only be confirmed for donations that have been picked up.`,
      });
    }

    // Check if donation has a receiver assigned
    if (!donation.assignedReceiverId) {
      return res.status(400).json({
        success: false,
        message: 'This donation has not been assigned to a receiver',
      });
    }

    // Update donation: change status to 'delivered'
    donation.status = 'delivered';
    await donation.save();

    console.log('[Donations] Delivery confirmed successfully:', {
      donationId: donation._id,
      trackingId: donation.trackingId,
      driverId: driverId,
      receiverId: donation.assignedReceiverId,
      status: donation.status,
    });

    // Fetch donor, receiver, and driver details for emails
    const donor = await User.findById(donation.donorId).select('-password');
    const receiver = await User.findById(donation.assignedReceiverId).select('-password');
    const driver = await User.findById(driverId).select('-password');

    if (!donor || !receiver || !driver) {
      console.error('[Donations] Missing user data for email notifications');
    }

    // Send email notifications (async, don't block response)
    const { 
      sendDeliveryConfirmedEmailToDonor, 
      sendDeliveryConfirmedEmailToReceiver 
    } = require('../utils/emailService');

    // Send email to donor
    if (donor) {
      sendDeliveryConfirmedEmailToDonor(donation, donor, receiver, driver)
        .catch(error => {
          console.error('[Donations] Error sending delivery confirmation email to donor:', error.message);
        });
    }

    // Send email to receiver
    if (receiver) {
      sendDeliveryConfirmedEmailToReceiver(donation, receiver, driver)
        .catch(error => {
          console.error('[Donations] Error sending delivery confirmation email to receiver:', error.message);
        });
    }

    // Populate donation details for response
    await donation.populate('donorId', 'address email donorType username businessName');
    await donation.populate('assignedReceiverId', 'receiverName receiverType email address');
    await donation.populate('assignedDriverId', 'driverName vehicleNumber vehicleType');

    res.status(200).json({
      success: true,
      message: 'Delivery confirmed successfully. Emails have been sent to donor and receiver.',
      donation: {
        id: donation._id,
        trackingId: donation.trackingId,
        status: donation.status,
        assignedDriverId: donation.assignedDriverId?._id?.toString(),
        driverName: donation.assignedDriverId?.driverName,
        assignedReceiverId: donation.assignedReceiverId?._id?.toString(),
        receiverName: donation.assignedReceiverId?.receiverName,
      },
    });
  } catch (error) {
    console.error('[Donations] Error confirming delivery:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm delivery',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/:id/receipt-details
 * Get donation details for receipt creation
 * Requires authentication (Receiver role)
 */
router.get('/:id/receipt-details', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const receiverId = req.user.id;

    // Check if user is a Receiver
    if (req.user.role !== 'Receiver') {
      return res.status(403).json({
        success: false,
        message: 'Only receivers can access receipt details',
      });
    }

    // Find the donation
    const donation = await Donation.findById(id)
      .populate('donorId', 'email donorType username businessName address')
      .populate('assignedReceiverId', 'receiverName receiverType email address')
      .populate('assignedDriverId', 'driverName vehicleNumber vehicleType')
      .lean();

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    // Verify donation is assigned to the authenticated receiver
    if (!donation.assignedReceiverId || 
        donation.assignedReceiverId._id.toString() !== receiverId) {
      return res.status(403).json({
        success: false,
        message: 'This donation is not assigned to you',
      });
    }

    // Verify donation status is 'delivered'
    if (donation.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Receipt can only be created for delivered donations',
        status: donation.status,
      });
    }

    // Get donor information
    const donor = donation.donorId;
    const donorName = donor?.donorType === 'Business'
      ? donor?.businessName
      : donor?.username || donor?.email || 'Anonymous';

    // Get receiver information
    const receiver = donation.assignedReceiverId;
    const receiverName = receiver?.receiverName || receiver?.email || 'Receiver';

    // Get driver information
    const driver = donation.assignedDriverId;
    const driverName = driver?.driverName || 'Driver';

    // Calculate distance if coordinates are available
    let distanceTraveled = 0;
    if (donation.donorLatitude && donation.donorLongitude && receiver?.address) {
      // Try to get receiver coordinates by geocoding address
      const receiverCoords = await geocodeAddress(receiver.address);
      if (receiverCoords) {
        distanceTraveled = calculateDistance(
          donation.donorLatitude,
          donation.donorLongitude,
          receiverCoords.lat,
          receiverCoords.lng
        );
      }
    }

    // Format delivery date
    const deliveryDate = donation.updatedAt || donation.actualPickupDate || donation.createdAt;
    const formattedDeliveryDate = new Date(deliveryDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    // Check if receipt already exists
    const existingReceipt = await ImpactReceipt.findOne({ donationId: id }).lean();

    // Format response
    const receiptDetails = {
      donation: {
        id: donation._id.toString(),
        trackingId: donation.trackingId,
        itemName: donation.itemName,
        quantity: donation.quantity,
        imageUrl: donation.imageUrl,
        foodCategory: donation.foodCategory,
        storageRecommendation: donation.storageRecommendation,
      },
      donor: {
        id: donor?._id?.toString(),
        name: donorName,
        email: donor?.email || '',
        address: donation.donorAddress || donor?.address || '',
        type: donor?.donorType || 'Individual',
      },
      receiver: {
        id: receiver?._id?.toString(),
        name: receiverName,
        type: receiver?.receiverType || '',
        address: receiver?.address || '',
      },
      driver: driver ? {
        id: driver._id?.toString(),
        name: driverName,
        vehicleNumber: driver.vehicleNumber || '',
        vehicleType: driver.vehicleType || '',
      } : null,
      deliveryDate: formattedDeliveryDate,
      deliveryDateRaw: deliveryDate,
      distanceTraveled: distanceTraveled,
    };

    // If receipt exists, include it in the response
    if (existingReceipt) {
      receiptDetails.existingReceipt = {
        dropLocation: existingReceipt.dropLocation,
        peopleFed: existingReceipt.peopleFed,
        weightPerServing: existingReceipt.weightPerServing,
        distanceTraveled: existingReceipt.distanceTraveled,
        methaneSaved: existingReceipt.methaneSaved,
        createdAt: existingReceipt.createdAt,
      };
    }

    console.log(`[Donations] Returning receipt details for donation ${id}`);

    res.status(200).json({
      success: true,
      receiptDetails,
    });
  } catch (error) {
    console.error('[Donations] Error fetching receipt details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch receipt details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/donations/:id/create-receipt
 * Create an impact receipt for a delivered donation
 * Requires authentication (Receiver role)
 */
router.post('/:id/create-receipt', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const receiverId = req.user.id;
    const { dropLocation, peopleFed, weightPerServing } = req.body;

    // Check if user is a Receiver
    if (req.user.role !== 'Receiver') {
      return res.status(403).json({
        success: false,
        message: 'Only receivers can create receipts',
      });
    }

    // Validate required fields (allow string numbers from form/JSON)
    if (!dropLocation || typeof dropLocation !== 'string' || dropLocation.trim() === '') {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'dropLocation', message: 'Drop location is required' }],
      });
    }

    const peopleFedNum = Number(peopleFed);
    if (!Number.isFinite(peopleFedNum) || peopleFedNum < 1) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'peopleFed', message: 'People fed must be a number greater than 0' }],
      });
    }

    const weightPerServingNum = Number(weightPerServing);
    if (!Number.isFinite(weightPerServingNum) || weightPerServingNum < 0.001) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'weightPerServing', message: 'Weight per serving must be a number greater than or equal to 0.001 kg' }],
      });
    }

    // Find the donation
    const donation = await Donation.findById(id)
      .populate('assignedReceiverId', 'address')
      .lean();

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    // Verify donation is assigned to the authenticated receiver
    if (!donation.assignedReceiverId || 
        donation.assignedReceiverId._id.toString() !== receiverId) {
      return res.status(403).json({
        success: false,
        message: 'This donation is not assigned to you',
      });
    }

    // Verify donation status is 'delivered'
    if (donation.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Receipt can only be created for delivered donations',
        status: donation.status,
      });
    }

    // Check if receipt already exists - one receipt per donation
    const existingReceipt = await ImpactReceipt.findOne({ donationId: id }).lean();
    if (existingReceipt) {
      return res.status(409).json({
        success: false,
        message: 'A receipt already exists for this donation',
      });
    }

    // Calculate distance if coordinates are available
    let distanceTraveled = 0;
    if (donation.donorLatitude && donation.donorLongitude && donation.assignedReceiverId?.address) {
      const receiverCoords = await geocodeAddress(donation.assignedReceiverId.address);
      if (receiverCoords) {
        distanceTraveled = calculateDistance(
          donation.donorLatitude,
          donation.donorLongitude,
          receiverCoords.lat,
          receiverCoords.lng
        );
      }
    }

    // Calculate methane saved: store in kg for display (formula factor 0.05; result in kg)
    // methaneSavedKg = quantity × weightPerServing × 0.05
    const quantity = Number(donation.quantity) || 0;
    const totalWeightKg = quantity * weightPerServingNum;
    const methaneSavedKg = totalWeightKg * 0.05;
    const methaneSavedRounded = Math.round(methaneSavedKg * 100) / 100;

    // Create impact receipt (ensure methaneSaved is a number so it persists)
    const impactReceipt = new ImpactReceipt({
      donationId: id,
      receiverId: receiverId,
      dropLocation: dropLocation.trim(),
      peopleFed: Math.round(peopleFedNum),
      weightPerServing: Math.round(weightPerServingNum * 1000) / 1000,
      distanceTraveled: distanceTraveled,
      methaneSaved: methaneSavedRounded,
    });

    await impactReceipt.save();

    console.log(`[Donations] Created impact receipt for donation ${id}`);
    console.log(`[Donations] Receipt details:`, {
      peopleFed: impactReceipt.peopleFed,
      weightPerServing: impactReceipt.weightPerServing,
      distanceTraveled: impactReceipt.distanceTraveled,
      methaneSaved: impactReceipt.methaneSaved,
      quantity: donation.quantity,
    });

    // Generate PDF and send emails asynchronously (don't block response)
    (async () => {
      try {
        // Fetch full donation data with populated fields
        const fullDonation = await Donation.findById(id)
          .populate('donorId', 'email donorType username businessName address role')
          .populate('assignedReceiverId', 'receiverName receiverType email address role')
          .populate('assignedDriverId', 'driverName vehicleNumber vehicleType email role')
          .lean();

        if (!fullDonation) {
          console.error(`[Donations] Donation ${id} not found for PDF generation`);
          return;
        }

        // Format donation data for PDF
        const donorName = fullDonation.donorId?.donorType === 'Business'
          ? fullDonation.donorId?.businessName
          : fullDonation.donorId?.username || fullDonation.donorId?.email || 'Anonymous';

        const receiverName = fullDonation.assignedReceiverId?.receiverName || fullDonation.assignedReceiverId?.email || 'Receiver';
        const driverName = fullDonation.assignedDriverId?.driverName || 'Driver';

        const deliveryDate = new Date(fullDonation.updatedAt || fullDonation.actualPickupDate || fullDonation.createdAt)
          .toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });

        const donationDataForPDF = {
          trackingId: fullDonation.trackingId,
          donor: {
            name: donorName,
            username: fullDonation.donorId?.username || '',
            businessName: fullDonation.donorId?.businessName || '',
            email: fullDonation.donorId?.email || '',
            address: fullDonation.donorAddress || fullDonation.donorId?.address || '',
            donorType: fullDonation.donorId?.donorType || 'Individual',
            type: fullDonation.donorId?.donorType || 'Individual',
          },
          receiver: {
            name: receiverName,
            receiverName: receiverName,
            receiverType: fullDonation.assignedReceiverId?.receiverType || '',
            type: fullDonation.assignedReceiverId?.receiverType || '',
            address: fullDonation.receiverAddress || fullDonation.assignedReceiverId?.address || '',
          },
          driver: fullDonation.assignedDriverId ? {
            name: driverName,
            driverName: driverName,
            vehicleNumber: fullDonation.assignedDriverId.vehicleNumber || '',
            vehicleType: fullDonation.assignedDriverId.vehicleType || '',
          } : null,
          donation: {
            itemName: fullDonation.itemName,
            quantity: fullDonation.quantity,
            foodCategory: fullDonation.foodCategory,
            storageRecommendation: fullDonation.storageRecommendation,
          },
          deliveryDate: deliveryDate,
          donorAddress: fullDonation.donorAddress || fullDonation.donorId?.address || '',
        };

        // Refresh receipt from database to ensure we have all saved values
        const savedReceipt = await ImpactReceipt.findById(impactReceipt._id).lean();
        
        console.log(`[Donations] Generating PDF for receipt ${impactReceipt._id}`);
        console.log(`[Donations] Saved receipt methaneSaved:`, savedReceipt?.methaneSaved);
        
        const pdfBuffer = await generateImpactReceiptPDF(savedReceipt, donationDataForPDF);
        console.log(`[Donations] PDF generated successfully for receipt ${impactReceipt._id}`);

        // Send emails with PDF attachment
        if (fullDonation.donorId && fullDonation.donorId.email) {
          try {
            await sendReceiptEmailToDonor(
              savedReceipt,
              {
                ...donationDataForPDF,
                itemName: fullDonation.itemName,
                receiver: donationDataForPDF.receiver,
              },
              fullDonation.donorId,
              pdfBuffer
            );
            console.log(`[Donations] Receipt email sent to donor: ${fullDonation.donorId.email}`);
          } catch (emailError) {
            console.error(`[Donations] Error sending receipt email to donor:`, emailError.message);
            // Continue with driver email even if donor email fails
          }
        }

        if (fullDonation.assignedDriverId && fullDonation.assignedDriverId.email) {
          try {
            await sendReceiptEmailToDriver(
              savedReceipt,
              {
                ...donationDataForPDF,
                itemName: fullDonation.itemName,
                receiver: donationDataForPDF.receiver,
              },
              fullDonation.assignedDriverId,
              pdfBuffer
            );
            console.log(`[Donations] Receipt email sent to driver: ${fullDonation.assignedDriverId.email}`);
          } catch (emailError) {
            console.error(`[Donations] Error sending receipt email to driver:`, emailError.message);
            // Don't fail receipt creation if email fails
          }
        }
      } catch (error) {
        console.error(`[Donations] Error generating PDF or sending emails for receipt:`, error);
        // Don't fail receipt creation if PDF/email generation fails
      }
    })();

    res.status(201).json({
      success: true,
      message: 'Impact receipt created successfully. PDF and emails are being generated.',
      receipt: {
        id: impactReceipt._id.toString(),
        donationId: impactReceipt.donationId.toString(),
        dropLocation: impactReceipt.dropLocation,
        peopleFed: impactReceipt.peopleFed,
        weightPerServing: impactReceipt.weightPerServing,
        distanceTraveled: impactReceipt.distanceTraveled,
        methaneSaved: impactReceipt.methaneSaved,
        createdAt: impactReceipt.createdAt,
      },
    });
  } catch (error) {
    console.error('[Donations] Error creating impact receipt:', error);
    
    // Handle duplicate key error (shouldn't happen due to check, but just in case)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Receipt already exists for this donation',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create impact receipt',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/donations/:id/receipt-pdf
 * Get PDF receipt for a donation
 * Requires authentication (Receiver role)
 */
router.get('/:id/receipt-pdf', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const receiverId = req.user.id;

    // Check if user is a Receiver
    if (req.user.role !== 'Receiver') {
      return res.status(403).json({
        success: false,
        message: 'Only receivers can access receipt PDFs',
      });
    }

    // Find the receipt
    const receipt = await ImpactReceipt.findOne({ donationId: id })
      .populate('donationId')
      .lean();

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found for this donation',
      });
    }

    // Verify receipt belongs to the authenticated receiver
    if (receipt.receiverId.toString() !== receiverId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this receipt',
      });
    }

    // Find the donation with all populated data
    const donation = await Donation.findById(id)
      .populate('donorId', 'email donorType username businessName address')
      .populate('assignedReceiverId', 'receiverName receiverType email address')
      .populate('assignedDriverId', 'driverName vehicleNumber vehicleType')
      .lean();

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    // Format donation data for PDF
    const donorName = donation.donorId?.donorType === 'Business'
      ? donation.donorId?.businessName
      : donation.donorId?.username || donation.donorId?.email || 'Anonymous';

    const receiverName = donation.assignedReceiverId?.receiverName || donation.assignedReceiverId?.email || 'Receiver';
    const driverName = donation.assignedDriverId?.driverName || 'Driver';

    const deliveryDate = new Date(donation.updatedAt || donation.actualPickupDate || donation.createdAt)
      .toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

    const donationData = {
      trackingId: donation.trackingId,
      donor: {
        name: donorName,
        email: donation.donorId?.email || '',
        address: donation.donorAddress || donation.donorId?.address || '',
        donorType: donation.donorId?.donorType || 'Individual',
      },
      receiver: {
        receiverName: receiverName,
        receiverType: donation.assignedReceiverId?.receiverType || '',
        address: donation.receiverAddress || donation.assignedReceiverId?.address || '',
      },
      driver: donation.assignedDriverId ? {
        driverName: driverName,
        vehicleNumber: donation.assignedDriverId.vehicleNumber || '',
        vehicleType: donation.assignedDriverId.vehicleType || '',
      } : null,
      donation: {
        itemName: donation.itemName,
        quantity: donation.quantity,
        foodCategory: donation.foodCategory,
        storageRecommendation: donation.storageRecommendation,
      },
      deliveryDate: deliveryDate,
    };

    // Generate PDF
    const pdfBuffer = await generateImpactReceiptPDF(receipt, donationData);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="impact-receipt-${donation.trackingId || id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`[Donations] Generated PDF receipt for donation ${id}`);

    // Send PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[Donations] Error generating PDF receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF receipt',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
