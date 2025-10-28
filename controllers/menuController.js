const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const MenuItem = require('../models/menuItems'); // Consistent naming
const Store = require('../models/store');

// ✅ Get Store Menu with filtering and categorization
exports.getStoreMenu = asyncHandler(async (req, res, next) => {
    const storeId = req.params.storeId;
    const { 
        category, 
        foodType, 
        available = 'true',
        sortBy = 'name',
        sortOrder = 'asc'
    } = req.query;
    
    // Check if store exists and is available
    const store = await Store.findOne({ 
        _id: storeId, 
        available: true 
    });
    
    if (!store) {
        return next(new AppError('Store not found or not available', 404));
    }

    // Build filter for menu items
    let filter = { storeId };
    
    if (category) filter.category = category;
    if (foodType) filter.foodType = foodType;
    if (available !== 'all') {
        filter.available = available === 'true';
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const menuItems = await MenuItem.find(filter)
        .sort(sortOptions)
        .select('-__v'); // Exclude version key

    // Group by category for better frontend display
    const menuByCategory = menuItems.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {});

    res.status(200).json({
        success: true,
        data: {
            store: {
                _id: store._id,
                storeName: store.storeName,
                isOpen: store.isOpen
            },
            menu: menuItems,
            menuByCategory,
            totalItems: menuItems.length
        }
    });
});

// ✅ Add Menu Item with enhanced validation
exports.addMenuItem = asyncHandler(async (req, res, next) => {
    const storeId = req.params.storeId;
    const ownerId = req.user._id;
    
    const { 
        name, 
        price, 
        category, 
        available, 
        description, 
        foodType, 
        preparationTime,
        stockQuantity,
        customizations,
        tags,
        discount
    } = req.body;

    // ✅ Check if store exists and user owns it
    const store = await Store.findOne({ _id: storeId, ownerId });
    if (!store) {
        return next(new AppError('Store not found or you do not have permission', 404));
    }

    if (!name || !price) {
        return next(new AppError('Name and price are required', 400));
    }

    // ✅ Check if menu item with same name already exists in this store
    const existingMenuItem = await MenuItem.findOne({ 
        storeId, 
        name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingMenuItem) {
        return next(new AppError('Menu item with this name already exists in your store', 400));
    }

    // ✅ Get image URL from uploaded file
    const imageUrl = req.file ? req.file.path : undefined;
    const images = imageUrl ? [imageUrl] : [];

    const newMenuItem = await MenuItem.create({
        storeId,
        name: name.trim(),
        price: parseFloat(price),
        originalPrice: parseFloat(price), // Set original price
        category: category || 'Veg Main Course',
        description: description?.trim(),
        foodType: foodType || 'veg',
        preparationTime: preparationTime ? parseInt(preparationTime) : 15,
        available: available !== 'false',
        stockQuantity: stockQuantity ? parseInt(stockQuantity) : 0,
        inStock: stockQuantity ? parseInt(stockQuantity) > 0 : true,
        images,
        customizations: customizations ? JSON.parse(customizations) : [],
        tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
        discount: discount ? parseFloat(discount) : 0
    });

    res.status(201).json({
        success: true,
        message: 'Menu item added successfully',
        data: {
            menuItem: newMenuItem
        }
    });
});

// ✅ Update Menu Item with ownership check
exports.updateMenuItem = asyncHandler(async (req, res, next) => {
    const menuItemId = req.params.menuItemId;
    const ownerId = req.user._id;
    
    const updates = { ...req.body };

    // ✅ Find menu item and check ownership
    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    const store = await Store.findOne({ 
        _id: menuItem.storeId, 
        ownerId 
    });
    if (!store) {
        return next(new AppError('You do not have permission to update this menu item', 403));
    }

    // ✅ If new image uploaded, add to images array
    if (req.file) {
        if (!updates.images) {
            updates.images = [...menuItem.images];
        }
        updates.images.push(req.file.path);
    }

    // ✅ Convert price to number if provided
    if (updates.price) {
        updates.price = parseFloat(updates.price);
    }

    // ✅ Handle stock quantity update
    if (updates.stockQuantity !== undefined) {
        updates.stockQuantity = parseInt(updates.stockQuantity);
        updates.inStock = updates.stockQuantity > 0;
    }

    // ✅ Convert available to boolean
    if (updates.available !== undefined) {
        updates.available = updates.available !== 'false';
    }

    // ✅ Parse customizations if provided
    if (updates.customizations) {
        updates.customizations = JSON.parse(updates.customizations);
    }

    // ✅ Parse tags if provided
    if (updates.tags && typeof updates.tags === 'string') {
        updates.tags = updates.tags.split(',').map(tag => tag.trim());
    }

    const updatedMenuItem = await MenuItem.findByIdAndUpdate(
        menuItemId, 
        updates, 
        { 
            new: true, 
            runValidators: true 
        }
    );
    
    res.status(200).json({
        success: true,
        message: 'Menu item updated successfully',
        data: {
            menuItem: updatedMenuItem
        }
    }); 
});

// ✅ Delete Menu Item with ownership check
exports.deleteMenuItem = asyncHandler(async (req, res, next) => {
    const menuItemId = req.params.menuItemId;
    const ownerId = req.user._id;

    // ✅ Find menu item and check ownership
    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    const store = await Store.findOne({ 
        _id: menuItem.storeId, 
        ownerId 
    });
    if (!store) {
        return next(new AppError('You do not have permission to delete this menu item', 403));
    }

    const deletedMenuItem = await MenuItem.findByIdAndDelete(menuItemId);                     
    
    res.status(200).json({
        success: true,
        message: 'Menu item deleted successfully',
        data: null
    }); 
});

// ✅ Toggle Availability with ownership check
exports.toggleAvailability = asyncHandler(async (req, res, next) => {
    const menuItemId = req.params.menuItemId;
    const ownerId = req.user._id;
    
    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    // ✅ Check ownership
    const store = await Store.findOne({ 
        _id: menuItem.storeId, 
        ownerId 
    });
    if (!store) {
        return next(new AppError('You do not have permission to modify this menu item', 403));
    }

    menuItem.available = !menuItem.available;
    await menuItem.save();
    
    res.status(200).json({
        success: true,
        message: `Menu item ${menuItem.available ? 'enabled' : 'disabled'}`,
        data: {
            menuItem
        }
    });
});

// ✅ NEW: Get menu items by category
exports.getMenuByCategory = asyncHandler(async (req, res, next) => {
    const storeId = req.params.storeId;
    const { category } = req.params;

    const store = await Store.findOne({ _id: storeId, available: true });
    if (!store) {
        return next(new AppError('Store not found', 404));
    }

    const menuItems = await MenuItem.find({ 
        storeId, 
        category,
        available: true 
    }).sort({ name: 1 });

    res.status(200).json({
        success: true,
        data: {
            store: store.storeName,
            category,
            menuItems,
            count: menuItems.length
        }
    });
});

// ✅ NEW: Update stock quantity
exports.updateStock = asyncHandler(async (req, res, next) => {
    const menuItemId = req.params.menuItemId;
    const ownerId = req.user._id;
    const { quantity, operation = 'set' } = req.body; // operation: 'set', 'increment', 'decrement'

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
        return next(new AppError('Menu item not found', 404));
    }

    // ✅ Check ownership
    const store = await Store.findOne({ 
        _id: menuItem.storeId, 
        ownerId 
    });
    if (!store) {
        return next(new AppError('You do not have permission to modify this menu item', 403));
    }

    let newQuantity;
    switch (operation) {
        case 'increment':
            newQuantity = menuItem.stockQuantity + parseInt(quantity);
            break;
        case 'decrement':
            newQuantity = Math.max(0, menuItem.stockQuantity - parseInt(quantity));
            break;
        case 'set':
        default:
            newQuantity = parseInt(quantity);
    }

    menuItem.stockQuantity = newQuantity;
    menuItem.inStock = newQuantity > 0;
    await menuItem.save();

    res.status(200).json({
        success: true,
        message: 'Stock updated successfully',
        data: {
            menuItem,
            newStock: newQuantity
        }
    });
});

// ✅ NEW: Get popular menu items for a store
exports.getPopularItems = asyncHandler(async (req, res, next) => {
    const storeId = req.params.storeId;
    const { limit = 10 } = req.query;

    const store = await Store.findOne({ _id: storeId, available: true });
    if (!store) {
        return next(new AppError('Store not found', 404));
    }

    const popularItems = await MenuItem.find({ 
        storeId, 
        available: true,
        timesOrdered: { $gt: 0 }
    })
    .sort({ timesOrdered: -1 })
    .limit(parseInt(limit));

    res.status(200).json({
        success: true,
        data: {
            store: store.storeName,
            popularItems,
            count: popularItems.length
        }
    });
});