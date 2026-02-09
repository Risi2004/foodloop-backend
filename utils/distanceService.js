/**
 * Distance Calculation Service
 * Haversine for straight-line; OSRM for driving route distance along roads
 */

const https = require('https');

const OSRM_HOST = 'router.project-osrm.org';
const ROUTE_TIMEOUT_MS = 5000;

/**
 * Get driving route distance in km via OSRM (along roads). Returns null on failure.
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {Promise<number|null>} Distance in kilometers or null
 */
const getRouteDistanceKm = (lat1, lng1, lat2, lng2) => {
  if (
    lat1 == null || lng1 == null || lat2 == null || lng2 == null ||
    isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)
  ) {
    return Promise.resolve(null);
  }
  const coords = `${lng1},${lat1};${lng2},${lat2}`;
  const path = `/route/v1/driving/${coords}?overview=false`;
  return new Promise((resolve) => {
    const req = https.get(
      { hostname: OSRM_HOST, path },
      (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.code !== 'Ok' || !data.routes?.[0]?.distance) {
              resolve(null);
              return;
            }
            resolve(data.routes[0].distance / 1000);
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(ROUTE_TIMEOUT_MS, () => {
      req.destroy();
      resolve(null);
    });
  });
};

/**
 * Calculate distance between two coordinates using Haversine formula (straight-line)
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  // Validate inputs
  if (
    lat1 == null || lng1 == null || lat2 == null || lng2 == null ||
    isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)
  ) {
    return null;
  }

  // Earth's radius in kilometers
  const R = 6371;

  // Convert degrees to radians
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  // Haversine formula
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Format distance for display
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted distance string
 */
const formatDistance = (distanceKm) => {
  if (distanceKm == null || isNaN(distanceKm)) {
    return 'N/A';
  }

  if (distanceKm < 1) {
    // Show in meters if less than 1 km
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  }

  // Show in kilometers with 1 decimal place
  return `${distanceKm.toFixed(1)} km`;
};

module.exports = {
  calculateDistance,
  formatDistance,
  getRouteDistanceKm,
};
