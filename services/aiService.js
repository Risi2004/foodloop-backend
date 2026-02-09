const { AI_SERVICE_URL, AI_SERVICE_TIMEOUT } = require('../config/env');

/**
 * Analyze food image using AI service
 * @param {String} imageUrl - URL of the image to analyze
 * @returns {Promise<Object>} AI predictions object
 */
const analyzeFoodImage = async (imageUrl) => {
  try {
    // Check if AI service URL is configured (only return mock if actually not set)
    if (!AI_SERVICE_URL) {
      console.warn('AI service URL not configured. Using mock data.');
      return getMockPredictions();
    }

    console.log(`[AI Service] Calling AI service at: ${AI_SERVICE_URL}/predict`);
    console.log(`[AI Service] Image URL: ${imageUrl}`);
    console.log(`[AI Service] Timeout set to: ${AI_SERVICE_TIMEOUT}ms (${AI_SERVICE_TIMEOUT / 1000}s)`);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`[AI Service] Request timeout after ${AI_SERVICE_TIMEOUT}ms`);
      controller.abort();
    }, AI_SERVICE_TIMEOUT);

    try {
      const response = await fetch(`${AI_SERVICE_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: imageUrl,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          const errorText = await response.text();
          errorData = { message: errorText };
        }
        
        console.error(`[AI Service] Error response (${response.status}):`, errorData);
        
        // Handle validation errors (AI-generated images or non-food items detected)
        if (response.status === 400 && errorData.detail) {
          const detail = typeof errorData.detail === 'string' 
            ? { message: errorData.detail } 
            : errorData.detail;
          
          const message = detail.message || detail.error || '';
          
          // Check if it's an AI-generated image error
          if (message.includes('AI-generated') || 
              message.includes('ai-generated') ||
              message.includes('synthetic') ||
              message.includes('fake') ||
              message.includes('computer-generated')) {
            throw new Error('AI-generated images are not allowed. Please upload a real photo of food.');
          }
          
          // Check if it's a non-food item error
          if (message.includes('does not contain food') || 
              message.includes('not related to food') ||
              message.includes('Non-food items')) {
            throw new Error('This image is not related to food items. Please upload an image of food only.');
          }
          
          throw new Error(message || 'Invalid image content');
        }
        
        // Check for rate limit errors
        const errorMessage = errorData.detail?.message || errorData.message || '';
        if (response.status === 503 && (errorMessage.includes('quota') || errorMessage.includes('rate limit'))) {
          throw new Error('AI service rate limit exceeded. Please try again later or upgrade your API plan.');
        }
        
        throw new Error(errorMessage || `AI service returned error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[AI Service] Received predictions:', JSON.stringify(data, null, 2));
      
      // Validate response structure
      if (!data || typeof data !== 'object') {
        console.error('[AI Service] Invalid response structure:', data);
        throw new Error('Invalid response from AI service');
      }

      // Validate required fields
      const requiredFields = ['foodCategory', 'itemName', 'quantity', 'storageRecommendation', 'confidence'];
      const missingFields = requiredFields.filter(field => !(field in data));
      if (missingFields.length > 0) {
        console.warn(`[AI Service] Missing fields in response: ${missingFields.join(', ')}`);
        // Fill missing fields with defaults
        if (!data.foodCategory) data.foodCategory = 'Cooked Meals';
        if (!data.itemName) data.itemName = 'Food Item';
        if (!data.quantity) data.quantity = 1;
        if (!data.storageRecommendation) data.storageRecommendation = 'Hot';
        if (!data.confidence) data.confidence = 0.5;
      }

      console.log('[AI Service] Successfully analyzed image');
      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('[AI Service] Request timed out');
        throw new Error('AI service request timed out. Please try again.');
      }
      
      if (fetchError.message.includes('ECONNREFUSED') || fetchError.message.includes('fetch failed')) {
        console.error('[AI Service] Connection refused - service may not be running');
        throw new Error('AI service is not available. Please ensure the service is running.');
      }
      
      console.error('[AI Service] Fetch error:', fetchError.message);
      throw fetchError;
    }
  } catch (error) {
    console.error('[AI Service] Error calling AI service:', error.message);
    console.error('[AI Service] Stack:', error.stack);
    
    // If it's a connection error, return mock data for graceful degradation
    if (error.message.includes('not available') || error.message.includes('ECONNREFUSED')) {
      console.warn('[AI Service] AI service unavailable, returning mock predictions');
      return getMockPredictions();
    }
    
    throw error;
  }
};

/**
 * Get mock predictions for development/testing
 * @returns {Object} Mock prediction data
 */
const getMockPredictions = () => {
  return {
    foodCategory: 'Cooked Meals',
    itemName: 'Vegetable Curry with Rice',
    quantity: 15,
    qualityScore: 0.90,
    freshness: 'Fresh',
    storageRecommendation: 'Hot',
    confidence: 0.90,
    detectedItems: ['rice', 'curry', 'vegetables'],
  };
};

module.exports = { analyzeFoodImage };
