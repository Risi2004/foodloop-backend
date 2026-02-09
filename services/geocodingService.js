/**
 * Geocoding Service
 * Converts addresses to coordinates using OpenStreetMap Nominatim API
 */

// Simple in-memory cache to avoid repeated API calls
const geocodeCache = new Map();

/**
 * Geocode an address to coordinates
 * @param {string} address - Address string to geocode
 * @returns {Promise<{lat: number, lng: number} | null>} Coordinates or null if geocoding fails
 */
const geocodeAddress = async (address) => {
  if (!address || typeof address !== 'string' || address.trim() === '') {
    console.warn('[Geocoding] Invalid address provided');
    return null;
  }

  // Check cache first
  const cacheKey = address.toLowerCase().trim();
  if (geocodeCache.has(cacheKey)) {
    console.log(`[Geocoding] Using cached coordinates for: ${address}`);
    return geocodeCache.get(cacheKey);
  }

  try {
    // Format address for better geocoding accuracy
    let searchAddress = address.trim();
    
    // Normalize address - handle common Sri Lankan address patterns
    const addressLower = searchAddress.toLowerCase();
    
    // Add Colombo for Wellawatte and other Colombo suburbs
    if (addressLower.includes('wellawatte') || 
        addressLower.includes('wellawatta') ||
        addressLower.includes('colombo')) {
      if (!addressLower.includes('colombo') && !addressLower.includes('sri lanka')) {
        searchAddress = `${searchAddress}, Colombo, Sri Lanka`;
      } else if (!addressLower.includes('sri lanka')) {
        searchAddress = `${searchAddress}, Sri Lanka`;
      }
    } else if (!addressLower.includes('sri lanka') && !addressLower.includes('lanka')) {
      // For other addresses, add Sri Lanka
      searchAddress = `${searchAddress}, Sri Lanka`;
    }

    // Use Nominatim API with country code for better accuracy
    const encodedAddress = encodeURIComponent(searchAddress);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&countrycodes=lk&limit=1&addressdetails=1`;
    
    console.log(`[Geocoding] Geocoding address: ${searchAddress}`);
    
    // Add delay to respect rate limits (1 request per second)
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FoodLoop-App/1.0', // Required by Nominatim
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding API returned status ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      console.warn(`[Geocoding] No results found for address: ${address}`);
      // Cache null result to avoid repeated failed lookups
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const result = data[0];
    const coordinates = {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };

    // Log the geocoded result details for debugging
    const displayName = result.display_name || 'Unknown';
    console.log(`[Geocoding] Geocoded result: "${displayName}"`);
    console.log(`[Geocoding] Coordinates: [${coordinates.lat}, ${coordinates.lng}]`);
    
    // Validate coordinates are reasonable for Sri Lanka
    // Sri Lanka is approximately: lat 5.9-9.8, lng 79.7-81.9
    if (coordinates.lat < 5 || coordinates.lat > 10 || 
        coordinates.lng < 79 || coordinates.lng > 82) {
      console.warn(`[Geocoding] Coordinates [${coordinates.lat}, ${coordinates.lng}] seem outside Sri Lanka bounds. Original address: ${address}`);
      // Still return the coordinates but log a warning
    }

    // Cache the result
    geocodeCache.set(cacheKey, coordinates);
    console.log(`[Geocoding] Successfully geocoded: ${address} → [${coordinates.lat}, ${coordinates.lng}]`);

    return coordinates;
  } catch (error) {
    console.error(`[Geocoding] Error geocoding address "${address}":`, error.message);
    // Cache null result
    geocodeCache.set(cacheKey, null);
    return null;
  }
};

/**
 * Geocode multiple addresses (with rate limiting)
 * @param {string[]} addresses - Array of addresses to geocode
 * @returns {Promise<Array<{lat: number, lng: number} | null>>} Array of coordinates
 */
const geocodeAddresses = async (addresses) => {
  const results = [];
  
  for (const address of addresses) {
    const coords = await geocodeAddress(address);
    results.push(coords);
    // Add delay between requests to respect rate limits
    if (addresses.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds between requests
    }
  }
  
  return results;
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  // Validate inputs
  if (typeof lat1 !== 'number' || typeof lng1 !== 'number' ||
      typeof lat2 !== 'number' || typeof lng2 !== 'number') {
    console.warn('[Distance] Invalid coordinates provided');
    return 0;
  }

  // Check if coordinates are valid (not NaN, not Infinity)
  if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2) ||
      !isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) {
    console.warn('[Distance] Invalid coordinate values (NaN or Infinity)');
    return 0;
  }

  // Earth's radius in kilometers
  const R = 6371;

  // Convert degrees to radians
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  // Haversine formula
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // Round to 2 decimal places
  return Math.round(distance * 100) / 100;
};

/**
 * Clear the geocoding cache
 */
const clearCache = () => {
  geocodeCache.clear();
  console.log('[Geocoding] Cache cleared');
};

module.exports = {
  geocodeAddress,
  geocodeAddresses,
  calculateDistance,
  clearCache,
};
