const multer = require('multer');
const { MAX_FILE_SIZE } = require('../config/env');

// Configure multer to store files in memory (for S3 upload)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Allow images
  if (file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  // Allow PDFs
  if (file.mimetype === 'application/pdf') {
    return cb(null, true);
  }
  // Reject other file types
  cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
};

// Configure multer with more lenient settings
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10, // Allow up to 10 files total
  },
  fileFilter: fileFilter,
  preservePath: false,
});

// Middleware for handling multiple file uploads
// All fields are optional - some roles don't need all files
// Using .any() to accept any field name, then we'll filter in the route
const uploadAny = upload.any();

// Wrap multer middleware with error handling
const handleFileUpload = (req, res, next) => {
  // Check if this is a multipart request
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    // Not a multipart request, skip multer
    return next();
  }

  uploadAny(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        code: err.code,
        field: err.field,
        stack: err.stack,
      });
      
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            errors: [{ field: 'file', message: 'File too large. Maximum size is 10MB' }],
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            errors: [{ field: 'file', message: 'Unexpected file field' }],
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            errors: [{ field: 'files', message: 'Too many files uploaded' }],
          });
        }
      }
      
      // Handle busboy/stream errors
      if (err.message && (err.message.includes('Unexpected end') || err.message.includes('stream'))) {
        console.error('Stream parsing error - this might indicate the request body was already consumed');
        return res.status(400).json({
          success: false,
          errors: [{ field: 'files', message: 'File upload error. Please ensure files are valid and try again.' }],
        });
      }
      
      return res.status(400).json({
        success: false,
        errors: [{ field: 'files', message: err.message || 'File upload error' }],
      });
    }
    
    // Organize files by field name for easier access
    if (req.files && Array.isArray(req.files)) {
      const filesByField = {};
      req.files.forEach(file => {
        if (!filesByField[file.fieldname]) {
          filesByField[file.fieldname] = [];
        }
        filesByField[file.fieldname].push(file);
      });
      req.files = filesByField;
    }
    
    next();
  });
};

module.exports = { handleFileUpload, uploadAny };
