const User = require("../models/user");
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ UPDATED: Get current customer profile (using req.user)
exports.getCustomer = asyncHandler(async (req, res, next) => {
    // req.user middleware se aayega (JWT verification ke baad)
    const userId = req.user.id; // ✅ Changed from req.params.customerId
    
    const user = await User.findById(userId);     
    if (!user) {
        return next(new AppError('User not found', 404));
    }
    
    // Check if user is customer
    if (user.role !== 'customer') {
        return next(new AppError('Access denied. Customer only.', 403));
    }
        
    res.status(200).json({
        status: 'success',
        data: {      
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                address: user.address,
                role: user.role
            }
        }
    }); 
});

// ✅ UPDATED: Update current customer profile
exports.updateCustomer = asyncHandler(async (req, res, next) => {
    const userId = req.user.id; // ✅ Changed from req.params.customerId
    const updates = req.body;
    
    // Remove sensitive fields that shouldn't be updated
    const allowedUpdates = ['name', 'phone', 'address'];
    const filteredUpdates = {};
    
    allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
            filteredUpdates[field] = updates[field];
        }
    });
    
    const updatedUser = await User.findByIdAndUpdate(
        userId, 
        filteredUpdates, 
        { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
        return next(new AppError('User not found', 404));
    }
    
    if (updatedUser.role !== 'customer') {
        return next(new AppError('Access denied. Customer only.', 403));
    }
        
    res.status(200).json({
        status: 'success',
        data: {  
            user: {
                id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                address: updatedUser.address,
                role: updatedUser.role
            }
        }
    }); 
});

// ✅ UPDATED: Delete current customer profile
exports.deleteCustomer = asyncHandler(async (req, res, next) => {  
    const userId = req.user.id; // ✅ Changed from req.params.customerId
    
    const deletedUser = await User.findByIdAndDelete(userId); 
    if (!deletedUser) {
        return next(new AppError('User not found', 404));
    }
    
    if (deletedUser.role !== 'customer') {
        return next(new AppError('Access denied. Customer only.', 403));
    }
         
    res.status(204).json({
        status: 'success',
        data: null
    }); 
});

// ✅ OPTIONAL: Keep admin functions if needed (for admin to manage any customer)
exports.getCustomerById = asyncHandler(async (req, res, next) => {
    const customerId = req.params.customerId;
    const user = await User.findById(customerId);     
    if (!user || user.role !== 'customer') {
        return next(new AppError('Customer not found', 404));
    }       
    res.status(200).json({
        status: 'success',
        data: {      
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                address: user.address
            }
        }
    }); 
});

exports.updateCustomerById = asyncHandler(async (req, res, next) => {
    const customerId = req.params.customerId;
    const updates = req.body;         
    const updatedUser = await User.findByIdAndUpdate(customerId, updates, { new: true, runValidators: true });
    if (!updatedUser || updatedUser.role !== 'customer') {
        return next(new AppError('Customer not found', 404));
    }         
    res.status(200).json({
        status: 'success',
        data: {  
            user: {
                id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                address: updatedUser.address
            }
        }
    }); 
});