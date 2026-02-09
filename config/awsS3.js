const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET_NAME,
} = require('./env');

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const uploadFileToS3 = async (file, folder = 'uploads') => {
  try {
    // Validate AWS configuration
    if (!AWS_ACCESS_KEY_ID || AWS_ACCESS_KEY_ID === 'your_aws_access_key_id_here') {
      throw new Error('AWS Access Key ID is not configured. Please set it in your .env file.');
    }
    if (!AWS_SECRET_ACCESS_KEY || AWS_SECRET_ACCESS_KEY === 'your_aws_secret_access_key_here') {
      throw new Error('AWS Secret Access Key is not configured. Please set it in your .env file.');
    }
    if (!AWS_S3_BUCKET_NAME || AWS_S3_BUCKET_NAME === 'your_bucket_name_here') {
      throw new Error('AWS S3 Bucket Name is not configured. Please set it in your .env file.');
    }
    if (!AWS_REGION || AWS_REGION === 'your_region_here') {
      throw new Error('AWS Region is not configured. Please set it in your .env file.');
    }

    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

    const uploadParams = {
      Bucket: AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // Return the S3 URL
    const fileUrl = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${fileName}`;
    return fileUrl;
  } catch (error) {
    console.error('Error uploading file to S3:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.Code || error.code);
    console.error('Full error:', error);
    
    // Provide more specific error messages
    if (error.message.includes('not configured')) {
      throw error; // Re-throw configuration errors as-is
    } else if (error.name === 'InvalidAccessKeyId') {
      throw new Error('Invalid AWS Access Key ID. Please check your credentials.');
    } else if (error.name === 'SignatureDoesNotMatch') {
      throw new Error('Invalid AWS Secret Access Key. Please check your credentials.');
    } else if (error.name === 'NoSuchBucket') {
      throw new Error(`S3 bucket "${AWS_S3_BUCKET_NAME}" does not exist. Please check your bucket name.`);
    } else if (error.name === 'AccessDenied') {
      throw new Error('Access denied to S3 bucket. Please check your IAM user permissions.');
    } else {
      throw new Error(`Failed to upload file to S3: ${error.message || error.name || 'Unknown error'}`);
    }
  }
};

/**
 * Upload donation image to S3 with lossless quality preservation
 * @param {Object} file - Multer file object
 * @returns {Promise<String>} S3 URL of uploaded image
 */
const uploadDonationImageToS3 = async (file) => {
  try {
    // Validate AWS configuration
    if (!AWS_ACCESS_KEY_ID || AWS_ACCESS_KEY_ID === 'your_aws_access_key_id_here') {
      throw new Error('AWS Access Key ID is not configured. Please set it in your .env file.');
    }
    if (!AWS_SECRET_ACCESS_KEY || AWS_SECRET_ACCESS_KEY === 'your_aws_secret_access_key_here') {
      throw new Error('AWS Secret Access Key is not configured. Please set it in your .env file.');
    }
    if (!AWS_S3_BUCKET_NAME || AWS_S3_BUCKET_NAME === 'your_bucket_name_here') {
      throw new Error('AWS S3 Bucket Name is not configured. Please set it in your .env file.');
    }
    if (!AWS_REGION || AWS_REGION === 'your_region_here') {
      throw new Error('AWS Region is not configured. Please set it in your .env file.');
    }

    // Validate file is an image
    if (!file.mimetype.startsWith('image/')) {
      throw new Error('File must be an image');
    }

    // Preserve original file extension
    const fileExtension = file.originalname.split('.').pop() || 
                         (file.mimetype === 'image/jpeg' ? 'jpg' : 
                          file.mimetype === 'image/png' ? 'png' : 
                          file.mimetype === 'image/webp' ? 'webp' : 'jpg');
    
    const fileName = `donation-images/${uuidv4()}.${fileExtension}`;

    // Upload with original quality - no compression
    const uploadParams = {
      Bucket: AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer, // Use original buffer - no processing
      ContentType: file.mimetype, // Preserve original MIME type
      // No compression settings - upload as-is for lossless quality
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // Return the S3 URL
    const fileUrl = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${fileName}`;
    return fileUrl;
  } catch (error) {
    console.error('Error uploading donation image to S3:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // Provide more specific error messages
    if (error.message.includes('not configured')) {
      throw error; // Re-throw configuration errors as-is
    } else if (error.name === 'InvalidAccessKeyId') {
      throw new Error('Invalid AWS Access Key ID. Please check your credentials.');
    } else if (error.name === 'SignatureDoesNotMatch') {
      throw new Error('Invalid AWS Secret Access Key. Please check your credentials.');
    } else if (error.name === 'NoSuchBucket') {
      throw new Error(`S3 bucket "${AWS_S3_BUCKET_NAME}" does not exist. Please check your bucket name.`);
    } else if (error.name === 'AccessDenied') {
      throw new Error('Access denied to S3 bucket. Please check your IAM user permissions.');
    } else {
      throw new Error(`Failed to upload donation image to S3: ${error.message || error.name || 'Unknown error'}`);
    }
  }
};

module.exports = { uploadFileToS3, uploadDonationImageToS3 };
