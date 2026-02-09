const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { geocodeAddress } = require('../services/geocodingService');

const OSRM_BASE = 'https://router.project-osrm.org';
const ROUTE_CACHE_MS = 5 * 60 * 1000; // 5 minutes
const routeCache = new Map();

const MAX_DONORS = 50;
const MAX_RECEIVERS = 50;
const RESPONSE_CACHE_MS = 5 * 60 * 1000; // 5 minutes
let responseCache = null;
let responseCacheTime = 0;

function getDonorDisplayName(user) {
  if (user.donorType === 'Business' && user.businessName) return user.businessName;
  if (user.username) return user.username;
  return user.email || 'Donor';
}

function getReceiverDisplayName(user) {
  if (user.receiverName) return user.receiverName;
  return user.email || 'Receiver';
}

/**
 * GET /api/map
 * Health check for map router (optional; confirms mount).
 */
router.get('/', (req, res) => {
  res.json({ ok: true, message: 'Map API' });
});

/**
 * GET /api/map/route
 * Driving route between two points (for driver demo). Calls OSRM, returns waypoints.
 * Query: startLat, startLng, endLat, endLng
 */
router.get('/route', async (req, res) => {
  try {
    const startLat = parseFloat(req.query.startLat);
    const startLng = parseFloat(req.query.startLng);
    const endLat = parseFloat(req.query.endLat);
    const endLng = parseFloat(req.query.endLng);

    if (Number.isNaN(startLat) || Number.isNaN(startLng) || Number.isNaN(endLat) || Number.isNaN(endLng)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid startLat, startLng, endLat, endLng',
      });
    }

    const cacheKey = `${startLat.toFixed(4)},${startLng.toFixed(4)},${endLat.toFixed(4)},${endLng.toFixed(4)}`;
    const cached = routeCache.get(cacheKey);
    if (cached && Date.now() - cached.time < ROUTE_CACHE_MS) {
      return res.status(200).json({ success: true, waypoints: cached.waypoints });
    }

    // OSRM: coordinates as lng,lat
    const coords = `${startLng},${startLat};${endLng},${endLat}`;
    const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'FoodLoop-App/1.0' },
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn('[Map] OSRM route error:', response.status, text);
      return res.status(502).json({
        success: false,
        message: 'Routing service unavailable or no route found',
      });
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0] || !data.routes[0].geometry || !data.routes[0].geometry.coordinates) {
      return res.status(404).json({
        success: false,
        message: 'No route found between points',
      });
    }

    // coordinates are [lng, lat]
    const coordsArray = data.routes[0].geometry.coordinates;
    const waypoints = coordsArray.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

    // Downsample to max 50 points if needed
    const maxPoints = 50;
    let result = waypoints;
    if (waypoints.length > maxPoints) {
      const step = (waypoints.length - 1) / (maxPoints - 1);
      result = [];
      for (let i = 0; i < maxPoints; i++) {
        const idx = i === maxPoints - 1 ? waypoints.length - 1 : Math.min(Math.round(i * step), waypoints.length - 1);
        result.push(waypoints[idx]);
      }
    }

    routeCache.set(cacheKey, { waypoints: result, time: Date.now() });

    res.status(200).json({ success: true, waypoints: result });
  } catch (error) {
    console.error('[Map] Route error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/map/locations
 * Public endpoint: returns donors and receivers (status completed) with geocoded coordinates.
 * Used by landing page map. Response cached for 5 minutes.
 */
router.get('/locations', async (req, res) => {
  try {
    if (responseCache && Date.now() - responseCacheTime < RESPONSE_CACHE_MS) {
      return res.status(200).json(responseCache);
    }

    const donors = await User.find({
      role: 'Donor',
      status: 'completed',
      address: { $exists: true, $ne: '', $type: 'string' },
    })
      .select('address username businessName donorType email')
      .limit(MAX_DONORS)
      .lean();

    const receivers = await User.find({
      role: 'Receiver',
      status: 'completed',
      address: { $exists: true, $ne: '', $type: 'string' },
    })
      .select('address receiverName email')
      .limit(MAX_RECEIVERS)
      .lean();

    const donorLocations = [];
    for (const user of donors) {
      const coords = await geocodeAddress(user.address);
      if (coords) {
        donorLocations.push({
          lat: coords.lat,
          lng: coords.lng,
          displayName: getDonorDisplayName(user),
        });
      }
    }

    const receiverLocations = [];
    for (const user of receivers) {
      const coords = await geocodeAddress(user.address);
      if (coords) {
        receiverLocations.push({
          lat: coords.lat,
          lng: coords.lng,
          displayName: getReceiverDisplayName(user),
          address: user.address || '',
        });
      }
    }

    const payload = { donors: donorLocations, receivers: receiverLocations };
    responseCache = payload;
    responseCacheTime = Date.now();

    res.status(200).json(payload);
  } catch (error) {
    console.error('[Map] Error fetching locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load map locations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
