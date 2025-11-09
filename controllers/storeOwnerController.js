const Store = require('../models/store');
const User = require("../models/user");
const MenuItem = require("../models/menuItems");
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { isValidObjectId, sanitizePagination, sanitizeString, sanitizeSearchQuery } = require('../utils/validators');

// ✅ Get Store Owner with better population
exports.getStoreOwner = asyncHandler(async (req, res, next) => {
    const ownerId = req.params.id;

    // Validate ObjectId
    if (!isValidObjectId(ownerId)) {
        return next(new AppError('Invalid owner ID', 400));
    }

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
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            stores: user.stores || []
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
        data: stores.map(store => ({
            id: store._id,
            storeName: store.storeName,
            address: store.address,
            phone: store.phone,
            category: store.category,
            description: store.description,
            deliveryTime: store.deliveryTime,
            minOrder: store.minOrder,
            openingTime: store.openingTime,
            closingTime: store.closingTime,
            deliveryFee: store.deliveryFee,
            isOpen: store.isOpen,
            rating: store.rating,
            totalReviews: store.totalReviews,
            isVerified: store.isVerified,
            status: store.status,
            menu: store.menu
        })),
        pagination: {
            page: options.page,
            pages: Math.ceil(total / options.limit),
            limit: options.limit,
            total
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
        category, 
        description,
        openingTime,
        closingTime,
        latitude,
        longitude,
        location
    } = req.body;

    // ✅ Check if user already has a store with same name
    const existingStoreName = await Store.findOne({ 
        ownerId, 
        storeName 
    });
    if (existingStoreName) {
        return next(new AppError('You already have a store with this name', 400));
    }

   

    // ✅ Prepare location data if coordinates are provided
    let locationData = undefined;
    if (location && location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        // If location object with coordinates is provided
        locationData = {
            type: 'Point',
            coordinates: [location.coordinates[0], location.coordinates[1]] // [longitude, latitude]
        };
    } else if (latitude !== undefined && longitude !== undefined) {
        // If latitude and longitude are provided separately
        locationData = {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)] // [longitude, latitude]
        };
    }

    const storeData = {
        ownerId,
        storeName,
        address,
        phone,
        category,
        description,
        openingTime: openingTime || "09:00",
        closingTime: closingTime || "23:00",
        status: 'pendingApproval' // Set status to pendingApproval when store is created (ready for admin review)
    };

    // Only set location if coordinates are provided
    if (locationData) {
        storeData.location = locationData;
    }

    const store = await Store.create(storeData);

    // ✅ Update user's stores array
    await User.findByIdAndUpdate(ownerId, {
        $push: { stores: store._id }
    });

    res.status(201).json({
        success: true,
        message: 'Store created successfully. Waiting for verification.',
        data: {
            id: store._id,
            storeName: store.storeName,
            address: store.address,
            phone: store.phone,
            licenseNumber: store.licenseNumber,
            licenseType: store.licenseType,
            category: store.category,
            description: store.description,
            openingTime: store.openingTime,
            closingTime: store.closingTime,
            deliveryFee: store.deliveryFee,
            status: store.status,
            isVerified: store.isVerified,
            verificationStatus: store.status, // Add for frontend compatibility
            isOpen: store.isOpen,
            rating: store.rating,
            totalReviews: store.totalReviews,
            ownerId: store.ownerId,
            createdAt: store.createdAt
        }
    });
});

// ✅ Update Store with ownership check
exports.updateStore = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    const ownerId = req.user._id;

    // Validate ObjectId
    if (!isValidObjectId(storeId)) {
        return next(new AppError('Invalid store ID', 400));
    }

    // Check if store exists and user owns it
    const store = await Store.findOne({ _id: storeId, ownerId });
    if (!store) {
        return next(new AppError('Store not found or you do not have permission', 404));
    }

    const updates = { ...req.body };
    
    // Sanitize string inputs
    if (updates.storeName) updates.storeName = sanitizeString(updates.storeName, 100);
    if (updates.address) updates.address = sanitizeString(updates.address, 500);
    if (updates.description) updates.description = sanitizeString(updates.description, 1000);
    if (updates.phone) updates.phone = sanitizeString(updates.phone, 20);
    if (updates.licenseNumber) updates.licenseNumber = sanitizeString(updates.licenseNumber, 50);

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
        data: {
            id: updatedStore._id,
            storeName: updatedStore.storeName,
            address: updatedStore.address,
            phone: updatedStore.phone,
            licenseNumber: updatedStore.licenseNumber,
            licenseType: updatedStore.licenseType,
            category: updatedStore.category,
            description: updatedStore.description,
            deliveryTime: updatedStore.deliveryTime,
            minOrder: updatedStore.minOrder,
            openingTime: updatedStore.openingTime,
            closingTime: updatedStore.closingTime,
            deliveryFee: updatedStore.deliveryFee,
            status: updatedStore.status,
            isVerified: updatedStore.isVerified,
            ownerId: updatedStore.ownerId,
            menu: updatedStore.menu,
            createdAt: updatedStore.createdAt,
            updatedAt: updatedStore.updatedAt
        }
    });
});

// ✅ Delete Store with cleanup
exports.deleteStore = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    const ownerId = req.user._id;

    // Validate ObjectId
    if (!isValidObjectId(storeId)) {
        return next(new AppError('Invalid store ID', 400));
    }

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
        data: stores.map(store => ({
            id: store._id,
            storeName: store.storeName,
            address: store.address,
            phone: store.phone,
            category: store.category,
            deliveryTime: store.deliveryTime,
            minOrder: store.minOrder,
            deliveryFee: store.deliveryFee,
            isOpen: store.isOpen,
            rating: store.rating,
            totalReviews: store.totalReviews,
            timesOrdered: store.timesOrdered
        })),
        pagination: {
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            limit: parseInt(limit),
            total
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
        data: stores.map(store => ({
            id: store._id,
            storeName: store.storeName,
            address: store.address,
            phone: store.phone,
            category: store.category,
            description: store.description,
            deliveryTime: store.deliveryTime,
            minOrder: store.minOrder,
            openingTime: store.openingTime,
            closingTime: store.closingTime,
            deliveryFee: store.deliveryFee,
            isOpen: store.isOpen,
            rating: store.rating,
            totalReviews: store.totalReviews,
            menu: store.menu || []
        })),
        pagination: {
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            limit: parseInt(limit),
            total
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
        data: {
            id: store._id,
            storeName: store.storeName,
            address: store.address,
            phone: store.phone,
            licenseNumber: store.licenseNumber,
            licenseType: store.licenseType,
            category: store.category,
            description: store.description,
            deliveryTime: store.deliveryTime,
            minOrder: store.minOrder,
            openingTime: store.openingTime,
            closingTime: store.closingTime,
            deliveryFee: store.deliveryFee,
            isOpen: store.isOpen,
            status: store.status,
            isVerified: store.isVerified,
            verificationStatus: store.status, // Add for frontend compatibility
            rating: store.rating,
            totalReviews: store.totalReviews,
            menu: store.menu || [],
            ownerId: store.ownerId
        }
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
        data: stores.map(store => ({
            id: store._id,
            storeName: store.storeName,
            address: store.address,
            phone: store.phone,
            category: store.category,
            description: store.description,
            deliveryTime: store.deliveryTime,
            minOrder: store.minOrder,
            openingTime: store.openingTime,
            closingTime: store.closingTime,
            deliveryFee: store.deliveryFee,
            isOpen: store.isOpen,
            status: store.status,
            isVerified: store.isVerified,
            verificationStatus: store.status, // Add for frontend compatibility
            rating: store.rating || 0,
            totalReviews: store.totalReviews || 0,
            menu: store.menu || [],
            createdAt: store.createdAt
        }))
    });
});

// ✅ NEW: Submit store for approval (change from draft to pendingApproval)
exports.submitStoreForApproval = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    const ownerId = req.user._id;

    // Validate ObjectId
    if (!isValidObjectId(storeId)) {
        return next(new AppError('Invalid store ID', 400));
    }

    const store = await Store.findOne({ _id: storeId, ownerId });
    if (!store) {
        return next(new AppError('Store not found or you do not have permission', 404));
    }

    // Only allow submission if store is in draft status
    if (store.status !== 'draft') {
        return next(new AppError(`Store cannot be submitted. Current status: ${store.status}`, 400));
    }

    // Validate required fields before submission
    if (!store.storeName || !store.address || !store.phone || !store.licenseNumber || !store.category) {
        return next(new AppError('Please complete all required fields before submitting for approval', 400));
    }

    store.status = 'pendingApproval';
    await store.save();

    res.status(200).json({
        success: true,
        message: 'Store submitted for approval. Waiting for admin verification.',
        data: {
            id: store._id,
            storeName: store.storeName,
            status: store.status,
            isVerified: store.isVerified
        }
    });
});

// ✅ NEW: Toggle store status
exports.toggleStoreStatus = asyncHandler(async (req, res, next) => {
    const storeId = req.params.id;
    const ownerId = req.user._id;

    // Validate ObjectId
    if (!isValidObjectId(storeId)) {
        return next(new AppError('Invalid store ID', 400));
    }

    const store = await Store.findOne({ _id: storeId, ownerId });
    if (!store) {
        return next(new AppError('Store not found or you do not have permission', 404));
    }

    store.isOpen = !store.isOpen;
    await store.save();

    res.status(200).json({
        success: true,
        message: `Store is now ${store.isOpen ? 'open' : 'closed'}`,
        data: {
            id: store._id,
            storeName: store.storeName,
            isOpen: store.isOpen,
            status: store.status
        }
    });
});