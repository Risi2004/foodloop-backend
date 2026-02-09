require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_S3_BUCKET_NAME',
  'JWT_SECRET',
];

// Placeholder values that should be replaced
const placeholderValues = {
  'JWT_SECRET': ['your_jwt_secret_key_here', 'your_jwt_secret', 'jwt_secret_here'],
  'AWS_ACCESS_KEY_ID': ['your_aws_access_key_id_here', 'your_aws_access_key_id'],
  'AWS_SECRET_ACCESS_KEY': ['your_aws_secret_access_key_here', 'your_aws_secret_access_key'],
  'AWS_S3_BUCKET_NAME': ['your_bucket_name_here', 'your_bucket_name'],
  'AWS_REGION': ['your_region_here', 'us-east-1'],
};

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
const placeholderVars = requiredEnvVars.filter(varName => {
  const value = process.env[varName];
  if (!value) return false;
  const placeholders = placeholderValues[varName] || [];
  return placeholders.some(placeholder => 
    value.toLowerCase().includes(placeholder.toLowerCase())
  );
});

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease create a .env file in the backend directory with all required variables.');
  console.error('You can use .env.example as a template.\n');
  process.exit(1);
}

if (placeholderVars.length > 0) {
  console.error('⚠️  WARNING: Placeholder values detected in environment variables:');
  placeholderVars.forEach(varName => {
    console.error(`   - ${varName}: Still using placeholder value`);
  });
  console.error('\n⚠️  SECURITY RISK: Please replace placeholder values with actual credentials.');
  console.error('   Your application may not work correctly with placeholder values.\n');
  
  // For JWT_SECRET, provide generation instructions
  if (placeholderVars.includes('JWT_SECRET')) {
    console.error('   To generate a secure JWT_SECRET, run:');
    console.error('   node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    console.error('   Or use: openssl rand -base64 32\n');
  }
  
  // In production, exit. In development, just warn.
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot start in production with placeholder values. Exiting...\n');
    process.exit(1);
  }
}

// Export environment configuration
module.exports = {
  // Server
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // MongoDB
  MONGODB_URI: process.env.MONGODB_URI,
  
  // AWS S3
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION,
  AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET,
  
  // File Upload Limits
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
  
  // Email Configuration (optional - email will be disabled if not configured)
  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT) || 587,
  EMAIL_USER: process.env.EMAIL_USER || 'foodloop.official27@gmail.com',
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD, // Gmail app password
  EMAIL_FROM: process.env.EMAIL_FROM || 'FoodLoop <foodloop.official27@gmail.com>',
  
  // AI Service Configuration
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  AI_SERVICE_TIMEOUT: parseInt(process.env.AI_SERVICE_TIMEOUT) || 60000, // 60 seconds (increased for Gemini API)
};
