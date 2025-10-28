const jwt = require('jsonwebtoken');
const User = require('../models/user');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ Protect routes - verify JWT token
exports.protect = asyncHandler(async (req, res, next) => {
    let token;

    // 1) Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    try {
        // 2) Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 3) Check if user still exists
        const currentUser = await User.findById(decoded.id);
        if (!currentUser) {
            return next(new AppError('The user belonging to this token no longer exists.', 401));
        }

        // 4) Grant access to protected route
        req.user = currentUser;
        next();
    } catch (error) {
        return next(new AppError('Invalid token. Please log in again.', 401));
    }
});

// ✅ Authorization - check user role
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(
                new AppError('You do not have permission to perform this action', 403)
            );
        }
        next();
    };
};

// ✅ Optional: Check if user owns the resource
exports.checkOwnership = (model) => {
    return asyncHandler(async (req, res, next) => {
        const doc = await model.findById(req.params.id);
        
        if (!doc) {
            return next(new AppError('Document not found', 404));
        }

        // Check if user owns the document or is admin
        if (doc.ownerId && doc.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return next(new AppError('You are not authorized to access this resource', 403));
        }

        // For user-specific documents
        if (doc.userId && doc.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return next(new AppError('You are not authorized to access this resource', 403));
        }

        next();
    });
};