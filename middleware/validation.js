const { body, validationResult } = require('express-validator');

// Common validation rules
const commonValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('contactNo')
    .notEmpty()
    .withMessage('Contact number is required')
    .trim(),
  body('address')
    .notEmpty()
    .withMessage('Address is required')
    .trim(),
];

// Donor Individual validation
const donorIndividualValidation = [
  ...commonValidation,
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .trim()
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters long'),
];

// Donor Business validation
const donorBusinessValidation = [
  ...commonValidation,
  body('businessName')
    .notEmpty()
    .withMessage('Business name is required')
    .trim(),
  body('businessType')
    .isIn(['Restaurant', 'Supermarket', 'Wedding Hall'])
    .withMessage('Invalid business type'),
];

// Receiver validation
const receiverValidation = [
  ...commonValidation,
  body('receiverName')
    .notEmpty()
    .withMessage('Receiver name is required')
    .trim(),
  body('receiverType')
    .isIn(['NGO', 'Food Banks', 'Service Organization'])
    .withMessage('Invalid receiver type'),
];

// Driver validation
const driverValidation = [
  ...commonValidation,
  body('driverName')
    .notEmpty()
    .withMessage('Driver name is required')
    .trim(),
  body('vehicleNumber')
    .notEmpty()
    .withMessage('Vehicle number is required')
    .trim(),
  body('vehicleType')
    .isIn(['Scooter', 'Bike', 'Car', 'Truck'])
    .withMessage('Invalid vehicle type'),
];

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

module.exports = {
  commonValidation,
  donorIndividualValidation,
  donorBusinessValidation,
  receiverValidation,
  driverValidation,
  handleValidationErrors,
};
