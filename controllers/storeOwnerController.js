const Store = require('../models/store');
const User = require("../models/user");
const MenuItem = require("../models/menuItems");
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ Get Store Owner with better population
exports.getStoreOwner = asyncHandler(async (req, res, next) => {
    const ownerId = req.params.id;

    const user = await User.findById(ownerId).populate({
        path: 'stores',
        select: 'storeName address phone category isOpen rating totalReviews',
        match: { available: true } // Only show available stores
    });

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    if (user.role !== 'storeOwner') { // Consistent role naming
        return next(new AppError('User is not a store owner', 400));
    }

    res.status(200).json({
        success: true,
        data: {
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                stores: user.stores
            }
        }
    });
});

// ✅ Get All Stores with filters and pagination
exports.getAllStores = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 10, 
        category, 
        isOpen,
        minRating 
    } = req.query;

    // Build filter object
    let filter = { available: true };
    
    if (category) filter.category = category;
    if (isOpen !== undefined) filter.isOpen = isOpen === 'true';
    if (minRating) filter.rating = { $gte: parseFloat(minRating) };

    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        populate: {
            path: "menu",
            match: { isAvailable: true },
            options: { limit: 5 },
            select: 'name price image foodType'
        },
        sort: { rating: -1, timesOrdered: -1 }
    };

    const stores = await Store.find(filter)
        .populate(options.populate)
        .limit(options.limit * 1)
        .skip((options.page - 1) * options.limit)
        .sort(options.sort);

    const total = await Store.countDocuments(filter);

    res.status(200).json({
        success: true,
        data: {
            stores,
            pagination: {
                current: options.page,
                pages: Math.ceil(total / options.limit),
                total
            }
        }
    });
});

// ✅ Create Store with enhanced validation
exports.createStore = asyncHandler(async (req, res, next) => {
    const ownerId = req.user._id;
    
    // Check if user is store owner
    if (req.user.role !== 'storeOwner') {
        return next(new AppError('Only store owners can create stores', 403));
    }

    const { 
        storeName, 
        address, 
        phone, 
        licenseNumber,
        licenseType,
        category, 
        description,
        deliveryTime, 
        minOrder,
        openingTime,
        closingTime,
        deliveryFee
    } = req.body;

    // ✅ Check if user already has a store with same name
    const existingStoreName = await Store.findOne({ 
        ownerId, 
        storeName 
    });
    if (existingStoreName) {
        return next(new AppError('You already have a store with this name', 400));
    }

    // ✅ Check if license number already exists
    const existingLicense = await Store.findOne({ licenseNumber });
    if (existingLicense) {
        return next(new AppError('License number already exists', 400));
    }

    const store = await Store.create({
        ownerId,
        storeName,
        address,
        phone,
        licenseNumber,
        licenseType,
        category,
        description,
        deliveryTime: deliveryTime || "20-30 min",
        minOrder: minOrder || 49,
        openingTime: openingTime || "09:00",
        closingTime: closingTime || "23:00",
        deliveryFee: deliveryFee || 0
    });

    // ✅ Update user's stores array
    await User.findByIdAndUpdate(ownerId, {
        $push: { stores: store._id }
    });

    res.status(201).json({
        success: true,
        message: 'Store created successfully. Waiting for verification.',
        data: { store }
    });
});

// ✅ Update Store with ownership check
exports.updateStore = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    const ownerId = req.user._id;

    // Check if store exists and user owns it
    const store = await Store.findOne({ _id: storeId, ownerId });
    if (!store) {
        return next(new AppError('Store not found or you do not have permission', 404));
    }

    const updates = { ...req.body };

    // ✅ Remove fields that shouldn't be updated directly
    delete updates.ownerId;
    delete updates.isVerified;
    delete updates.rating;
    delete updates.timesOrdered;

    // ✅ Check if license number already exists (for other stores)
    if (updates.licenseNumber) {
        const existingStore = await Store.findOne({ 
            licenseNumber: updates.licenseNumber, 
            _id: { $ne: storeId } 
        });
        if (existingStore) {
            return next(new AppError('License number already exists', 400));
        }
    }

    const updatedStore = await Store.findByIdAndUpdate(
        storeId, 
        updates, 
        { 
            new: true, 
            runValidators: true 
        }
    ).populate('menu');

    res.status(200).json({
        success: true,
        message: 'Store updated successfully',
        data: { store: updatedStore }
    });
});

// ✅ Delete Store with cleanup
exports.deleteStore = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    const ownerId = req.user._id;

    // Check if store exists and user owns it
    const store = await Store.findOne({ _id: storeId, ownerId });
    if (!store) {
        return next(new AppError('Store not found or you do not have permission', 404));
    }

    // ✅ Delete all menu items associated with this store
    await MenuItem.deleteMany({ storeId });

    // ✅ Remove store from user's stores array
    await User.findByIdAndUpdate(ownerId, {
        $pull: { stores: storeId }
    });

    // ✅ Delete the store
    await Store.findByIdAndDelete(storeId);

    res.status(200).json({
        success: true,
        message: 'Store and associated menu items deleted successfully',
    });
});

// ✅ Enhanced Search Stores
exports.searchStores = asyncHandler(async (req, res, next) => {
    const { 
        query, 
        category, 
        isOpen,
        foodType,
        minRating = 0,
        page = 1,
        limit = 10
    } = req.query;
    
    let filter = { 
        available: true,
        rating: { $gte: parseFloat(minRating) }
    };
    
    if (query) {
        filter.$or = [
            { storeName: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } }
        ];
    }
    
    if (category) {
        filter.category = category;
    }

    if (isOpen !== undefined) {
        filter.isOpen = isOpen === 'true';
    }

    const stores = await Store.find(filter)
        .select('storeName address phone category deliveryTime minOrder deliveryFee isOpen rating totalReviews timesOrdered')
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ rating: -1, timesOrdered: -1 });

    const total = await Store.countDocuments(filter);

    res.status(200).json({
        success: true,
        data: {
            stores,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / limit),
                total
            }
        }
    });
});

// ✅ Get Stores by Category with pagination
exports.getStoresByCategory = asyncHandler(async (req, res, next) => {
    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const stores = await Store.find({ 
        category,
        available: true 
    })
    .populate({
        path: "menu",
        match: { isAvailable: true },
        options: { limit: 5 },
        select: 'name price image foodType category'
    })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ rating: -1 });

    const total = await Store.countDocuments({ category, available: true });

    res.status(200).json({
        success: true,
        data: {
            stores,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / limit),
                total
            }
        }
    });
});

// ✅ Get Store by ID with full details
exports.getStoreById = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    
    const store = await Store.findById(storeId)
        .populate({
            path: "menu",
            match: { isAvailable: true },
            options: { sort: { category: 1, name: 1 } }
        })
        .populate({
            path: "ownerId",
            select: "name phone email"
        });
    
    if (!store || !store.available) {
        return next(new AppError('Store not found', 404));
    }
    
    res.status(200).json({
        success: true,
        data: { store }
    });
});

// ✅ NEW: Get stores by owner
exports.getMyStores = asyncHandler(async (req, res, next) => {
    const ownerId = req.user._id;

    const stores = await Store.find({ ownerId })
        .populate({
            path: "menu",
            options: { limit: 5 }
        })
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        data: { stores }
    });
});

// ✅ NEW: Toggle store status
exports.toggleStoreStatus = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    const ownerId = req.user._id;

    const store = await Store.findOne({ _id: storeId, ownerId });
    if (!store) {
        return next(new AppError('Store not found or you do not have permission', 404));
    }

    store.isOpen = !store.isOpen;
    await store.save();

    res.status(200).json({
        success: true,
        message: `Store is now ${store.isOpen ? 'open' : 'closed'}`,
        data: { isOpen: store.isOpen }
    });
});