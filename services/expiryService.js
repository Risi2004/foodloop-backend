/**
 * Expiry Date Calculation Service
 * Calculates expiry dates based on product type
 */

/**
 * Calculate expiry date for a donation
 * @param {Object} donationData - Donation data including productType, expiryDateFromPackage, userProvidedExpiryDate, createdAt
 * @returns {Date} Calculated expiry date
 */
const calculateExpiryDate = (donationData) => {
  const { productType, expiryDateFromPackage, userProvidedExpiryDate, createdAt } = donationData;
  
  // Default to current date if createdAt not provided
  const creationDate = createdAt ? new Date(createdAt) : new Date();
  
  // Prioritize user-provided expiry date if available
  if (userProvidedExpiryDate) {
    const expiryDate = new Date(userProvidedExpiryDate);
    console.log(`[ExpiryService] Using user-provided expiry date: ${expiryDate.toISOString()}`);
    return expiryDate;
  }

  // For cooked products: 2 days from creation date
  if (productType === 'cooked') {
    const expiryDate = new Date(creationDate);
    expiryDate.setDate(expiryDate.getDate() + 2); // Add 2 days
    console.log(`[ExpiryService] Cooked product - expiry date: ${expiryDate.toISOString()}`);
    return expiryDate;
  }
  
  // For packed products: use AI-detected expiry
  if (productType === 'packed') {
    if (expiryDateFromPackage) {
      const expiryDate = new Date(expiryDateFromPackage);
      console.log(`[ExpiryService] Packed product - using expiry from package: ${expiryDate.toISOString()}`);
      return expiryDate;
    }
    
    // Fallback: if no expiry detected, use 7 days from creation (default for packaged goods)
    const expiryDate = new Date(creationDate);
    expiryDate.setDate(expiryDate.getDate() + 7); // Add 7 days as fallback
    console.log(`[ExpiryService] Packed product - no expiry detected, using fallback: ${expiryDate.toISOString()}`);
    return expiryDate;
  }
  
  // Default fallback: 3 days from creation if product type is unknown
  const expiryDate = new Date(creationDate);
  expiryDate.setDate(expiryDate.getDate() + 3);
  console.log(`[ExpiryService] Unknown product type - using default expiry: ${expiryDate.toISOString()}`);
  return expiryDate;
};

module.exports = {
  calculateExpiryDate,
};
