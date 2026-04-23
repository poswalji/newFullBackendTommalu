const jwt = require('jsonwebtoken');
const DeliveryBoy = require('../models/deliveryBoy');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

const signToken = (id) => {
  return jwt.sign({ id, role: 'delivery' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '90d',
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    success: true,
    token,
    data: {
      user
    }
  });
};

// ✅ PUBLIC: Login Delivery Boy
exports.loginDeliveryBoy = asyncHandler(async (req, res, next) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return next(new AppError('Please provide phone and password!', 400));
  }

  const deliveryBoy = await DeliveryBoy.findOne({ phone }).select('+password');

  if (!deliveryBoy || !(await deliveryBoy.correctPassword(password, deliveryBoy.password))) {
    return next(new AppError('Incorrect phone or password', 401));
  }

  if (!deliveryBoy.isActive) {
    return next(new AppError('This account is deactivated. Please contact admin.', 401));
  }

  createSendToken(deliveryBoy, 200, res);
});

// ✅ ADMIN: Create Delivery Boy
exports.createDeliveryBoy = asyncHandler(async (req, res, next) => {
  const newDeliveryBoy = await DeliveryBoy.create({
    name: req.body.name,
    phone: req.body.phone,
    password: req.body.password,
    isActive: req.body.isActive !== undefined ? req.body.isActive : true
  });

  newDeliveryBoy.password = undefined;

  res.status(201).json({
    success: true,
    data: newDeliveryBoy
  });
});

// ✅ ADMIN: Get All Delivery Boys
exports.getAllDeliveryBoys = asyncHandler(async (req, res, next) => {
  const deliveryBoys = await DeliveryBoy.find();
  
  res.status(200).json({
    success: true,
    results: deliveryBoys.length,
    data: deliveryBoys
  });
});

// ✅ ADMIN: Update Delivery Boy
exports.updateDeliveryBoy = asyncHandler(async (req, res, next) => {
  const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!deliveryBoy) {
    return next(new AppError('No delivery boy found with that ID', 404));
  }

  res.status(200).json({
    success: true,
    data: deliveryBoy
  });
});

// ✅ ADMIN: Deactivate Delivery Boy
exports.deactivateDeliveryBoy = asyncHandler(async (req, res, next) => {
  const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(req.params.id, { isActive: false }, {
    new: true,
    runValidators: true
  });

  if (!deliveryBoy) {
    return next(new AppError('No delivery boy found with that ID', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Delivery boy deactivated successfully'
  });
});
