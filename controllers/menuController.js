const MenuItem = require('../models/menuItems');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ NEW: Get all products across stores with category filter (for customer browsing)
exports.getAllProducts = asyncHandler(async (req, res, next) => {
    const { 
        category, 
        foodType, 
        storeId,
        search,
        minPrice,
        maxPrice,
        available = 'true',
        sortBy = 'name',
        sortOrder = 'asc',
        page = 1,
        limit = 20
    } = req.query;
    
    // Build filter
    let filter = {};
    
    if (storeId) filter.storeId = storeId;
    if (category) filter.category = category;
    if (foodType) filter.foodType = foodType;
    if (available !== 'all') {
        filter.isAvailable = available === 'true';
    }
    if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } }
        ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [menuItems, total] = await Promise.all([
        MenuItem.find(filter)
            .populate('storeId', 'storeName category address phone isOpen rating status')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .select('-__v'),
        MenuItem.countDocuments(filter)
    ]);

    // Get unique categories from filtered items
    const categories = await MenuItem.distinct('category', filter);


    

    res.status(200).json({
        success: true,
        data: menuItems.filter((item)=>
            item.storeId?.isOpen && item.storeId?.status=="active"
        ).map(item => ({
            id: item._id,
            name: item.name,
            price: item.price,
            originalPrice: item.originalPrice,
            category: item.category,
            description: item.description,
            isAvailable: item.isAvailable,
            stockQuantity: item.stockQuantity,
            image: item.images?.[0] || item.image,
            foodType: item.foodType,
            preparationTime: item.preparationTime,
            discount: item.discount,
            tags: item.tags,
            customizations: item.customizations,
            storeId: item.storeId?._id || item.storeId,
            storeName: item.storeId?.storeName,
            storeCategory: item.storeId?.category,
            isPopular: item.timesOrdered > 15,
            isBestSeller: item.isBestSeller
        })),
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
        },
        categories,
        filters: {
            category: category || null,
            foodType: foodType || null,
            available: available !== 'all' ? available === 'true' : null
        }
    });
});

// ✅ NEW: Get all categories
exports.getAllCategories = asyncHandler(async (req, res, next) => {
    const categories = await MenuItem.distinct('category', { isAvailable: true });
    
    res.status(200).json({
        success: true,
        data: categories.map(cat => ({
            name: cat,
            count: 0 // Can be populated with actual count if needed
        }))
    });
});

// ✅ Get store menu items
exports.getStoreMenu = asyncHandler(async (req, res, next) => {
    const { storeId } = req.params;
    const { category, foodType, available = 'true' } = req.query;

    let filter = { storeId };

    if (category) filter.category = category;
    if (foodType) filter.foodType = foodType;
    if (available !== 'all') {
        filter.isAvailable = available === 'true';
    }

    const menuItems = await MenuItem.find(filter)
        .sort({ category: 1, name: 1 })
        .select('-__v');

    res.status(200).json({
        success: true,
        data: menuItems.map(item => ({
            id: item._id,
            name: item.name,
            price: item.price,
            originalPrice: item.originalPrice,
            category: item.category,
            description: item.description,
            isAvailable: item.isAvailable,
            stockQuantity: item.stockQuantity,
            image: item.images?.[0] || item.image,
            images: item.images,
            foodType: item.foodType,
            preparationTime: item.preparationTime,
            discount: item.discount,
            tags: item.tags,
            customizations: item.customizations,
            isBestSeller: item.isBestSeller,
            isSpecial: item.isSpecial,
            timesOrdered: item.timesOrdered
        }))
    });
});

// ✅ Add menu item (with image upload support)
exports.addMenuItem = asyncHandler(async (req, res, next) => {
    const { storeId } = req.params;
    const {
        name,
        price,
        category,
        description,
        foodType,
        available,
        stockQuantity,
        preparationTime,
        discount,
        tags,
        customizations,
        isBestSeller,
        isSpecial
    } = req.body;

    // Validate required fields
    if (!name || !price || !category) {
        return next(new AppError('Name, price, and category are required', 400));
    }

    // Check if store exists and belongs to user (for store owners)
    const Store = require('../models/store');
    const store = await Store.findById(storeId);
    
    if (!store) {
        return next(new AppError('Store not found', 404));
    }

    // If user is logged in (store owner route), verify ownership
    if (req.user && req.user.role === 'storeOwner') {
        if (store.ownerId.toString() !== req.user._id.toString()) {
            return next(new AppError('You do not have permission to add items to this store', 403));
        }
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
        imageUrl = req.file.path || req.file.url;
    }

    // Parse tags if string
    let tagsArray = [];
    if (tags) {
        tagsArray = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags;
    }

    // Parse customizations if provided as JSON string
    let customizationsArray = [];
    if (customizations) {
        try {
            customizationsArray = typeof customizations === 'string' 
                ? JSON.parse(customizations) 
                : customizations;
        } catch (e) {
            customizationsArray = [];
        }
    }

    const menuItem = await MenuItem.create({
        storeId,
        name,
        price: parseFloat(price),
        category,
        description,
        foodType: foodType || 'veg',
        isAvailable: available !== undefined ? available === 'true' || available === true : true,
        stockQuantity: stockQuantity ? parseInt(stockQuantity) : 0,
        preparationTime: preparationTime ? parseInt(preparationTime) : 15,
        discount: discount ? parseFloat(discount) : 0,
        tags: tagsArray,
        customizations: customizationsArray,
        isBestSeller: isBestSeller === 'true' || isBestSeller === true,
        isSpecial: isSpecial === 'true' || isSpecial === true,
        images: imageUrl ? [imageUrl] : []
    });

    res.status(201).json({
        success: true,
        data: {
            id: menuItem._id,
            name: menuItem.name,
            price: menuItem.price,
            category: menuItem.category,
            description: menuItem.description,
            isAvailable: menuItem.isAvailable,
            stockQuantity: menuItem.stockQuantity,
            image: menuItem.images?.[0],
            foodType: menuItem.foodType,
            preparationTime: menuItem.preparationTime,
            discount: menuItem.discount,
            tags: menuItem.tags,
            customizations: menuItem.customizations,
            isBestSeller: menuItem.isBestSeller,
            isSpecial: menuItem.isSpecial
        }
    });
});

// ✅ Update menu item (with optional image upload)
exports.updateMenuItem = asyncHandler(async (req, res, next) => {
    const { menuItemId } = req.params;

    const menuItem = await MenuItem.findById(menuItemId);
    
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    // Verify ownership if user is store owner
    if (req.user && req.user.role === 'storeOwner') {
        const Store = require('../models/store');
        const store = await Store.findById(menuItem.storeId);
        
        if (!store || store.ownerId.toString() !== req.user._id.toString()) {
            return next(new AppError('You do not have permission to update this menu item', 403));
        }
    }

    // Handle image upload
    if (req.file) {
        const imageUrl = req.file.path || req.file.url;
        if (imageUrl) {
            req.body.images = req.body.images || [];
            if (Array.isArray(req.body.images)) {
                req.body.images.push(imageUrl);
            } else {
                req.body.images = [imageUrl];
            }
        }
    }

    // Parse tags if string
    if (req.body.tags && typeof req.body.tags === 'string') {
        req.body.tags = req.body.tags.split(',').map(t => t.trim());
    }

    // Parse customizations if provided as JSON string
    if (req.body.customizations && typeof req.body.customizations === 'string') {
        try {
            req.body.customizations = JSON.parse(req.body.customizations);
        } catch (e) {
            // Keep as is if parsing fails
        }
    }

    // Convert string booleans to actual booleans
    if (req.body.available !== undefined) {
        req.body.isAvailable = req.body.available === 'true' || req.body.available === true;
        delete req.body.available;
    }
    if (req.body.isBestSeller !== undefined) {
        req.body.isBestSeller = req.body.isBestSeller === 'true' || req.body.isBestSeller === true;
    }
    if (req.body.isSpecial !== undefined) {
        req.body.isSpecial = req.body.isSpecial === 'true' || req.body.isSpecial === true;
    }

    // Convert numeric strings to numbers
    if (req.body.price) req.body.price = parseFloat(req.body.price);
    if (req.body.stockQuantity) req.body.stockQuantity = parseInt(req.body.stockQuantity);
    if (req.body.preparationTime) req.body.preparationTime = parseInt(req.body.preparationTime);
    if (req.body.discount) req.body.discount = parseFloat(req.body.discount);

    const updatedItem = await MenuItem.findByIdAndUpdate(
        menuItemId,
        req.body,
        { new: true, runValidators: true }
    );

    res.status(200).json({
        success: true,
        data: {
            id: updatedItem._id,
            name: updatedItem.name,
            price: updatedItem.price,
            category: updatedItem.category,
            description: updatedItem.description,
            isAvailable: updatedItem.isAvailable,
            stockQuantity: updatedItem.stockQuantity,
            image: updatedItem.images?.[0],
            images: updatedItem.images,
            foodType: updatedItem.foodType,
            preparationTime: updatedItem.preparationTime,
            discount: updatedItem.discount,
            tags: updatedItem.tags,
            customizations: updatedItem.customizations,
            isBestSeller: updatedItem.isBestSeller,
            isSpecial: updatedItem.isSpecial
        }
    });
});

// ✅ Delete menu item
exports.deleteMenuItem = asyncHandler(async (req, res, next) => {
    const { menuItemId } = req.params;

    const menuItem = await MenuItem.findById(menuItemId);
    
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    // Verify ownership if user is store owner
    if (req.user && req.user.role === 'storeOwner') {
        const Store = require('../models/store');
        const store = await Store.findById(menuItem.storeId);
        
        if (!store || store.ownerId.toString() !== req.user._id.toString()) {
            return next(new AppError('You do not have permission to delete this menu item', 403));
        }
    }

    await MenuItem.findByIdAndDelete(menuItemId);

    res.status(200).json({
        success: true,
        message: 'Menu item deleted successfully'
    });
});

// ✅ Toggle menu item availability
exports.toggleAvailability = asyncHandler(async (req, res, next) => {
    const { menuItemId } = req.params;

    const menuItem = await MenuItem.findById(menuItemId);
    
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    // Verify ownership if user is store owner
    if (req.user && req.user.role === 'storeOwner') {
        const Store = require('../models/store');
        const store = await Store.findById(menuItem.storeId);
        
        if (!store || store.ownerId.toString() !== req.user._id.toString()) {
            return next(new AppError('You do not have permission to toggle availability of this menu item', 403));
        }
    }

    menuItem.isAvailable = !menuItem.isAvailable;
    await menuItem.save();

    res.status(200).json({
        success: true,
        data: {
            id: menuItem._id,
            name: menuItem.name,
            isAvailable: menuItem.isAvailable,
            price: menuItem.price,
            category: menuItem.category,
            description: menuItem.description,
            foodType: menuItem.foodType,
            stockQuantity: menuItem.stockQuantity,
            image: menuItem.images?.[0]
        }
    });
});

// ✅ Get menu item by ID
exports.getMenuItemById = asyncHandler(async (req, res, next) => {
    const { menuItemId } = req.params;

    const menuItem = await MenuItem.findById(menuItemId)
        .populate('storeId', 'storeName category address phone isOpen rating');
    
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    // Verify ownership if user is store owner
    if (req.user && req.user.role === 'storeOwner') {
        const Store = require('../models/store');
        const store = await Store.findById(menuItem.storeId);
        
        if (!store || store.ownerId.toString() !== req.user._id.toString()) {
            return next(new AppError('You do not have permission to view this menu item', 403));
        }
    }

    res.status(200).json({
        success: true,
        data: {
            id: menuItem._id,
            name: menuItem.name,
            price: menuItem.price,
            originalPrice: menuItem.originalPrice,
            category: menuItem.category,
            description: menuItem.description,
            isAvailable: menuItem.isAvailable,
            stockQuantity: menuItem.stockQuantity,
            image: menuItem.images?.[0],
            images: menuItem.images,
            foodType: menuItem.foodType,
            preparationTime: menuItem.preparationTime,
            discount: menuItem.discount,
            tags: menuItem.tags,
            customizations: menuItem.customizations,
            isBestSeller: menuItem.isBestSeller,
            isSpecial: menuItem.isSpecial,
            timesOrdered: menuItem.timesOrdered,
            storeId: menuItem.storeId?._id || menuItem.storeId,
            storeName: menuItem.storeId?.storeName,
            createdAt: menuItem.createdAt,
            updatedAt: menuItem.updatedAt
        }
    });
});
