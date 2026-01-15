const mongoose = require('mongoose');
const DailyMenu = require('../models/dailyMenu');
const Order = require('../models/orderSchema');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/asyncHandler');
const emailService = require('../utils/emailService');

// Helper to get current Indian time
const getIndianTime = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const getTodayDateString = () => {
    const d = getIndianTime();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getDayName = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[getIndianTime().getDay()];
};

// Helper to get or create necessary reference documents for strict OrderSchema
const ensureReferences = async () => {
    const Store = require('../models/store');
    const MenuItem = require('../models/menuItems');

    // 1. Get/Create Store
    let store = await Store.findOne({ storeName: "Tommalu Home Kitchen" });
    if (!store) {
        store = await Store.create({
            storeName: "Tommalu Home Kitchen",
            ownerId: new mongoose.Types.ObjectId(), // Placeholder
            address: "Jaipur",
            city: "Jaipur",
            pincode: "302001",
            phone: "9999999999",
            category: "Homemade Food",
            isOpen: true
        });
    }

    // 2. Get/Create Menu Items
    let dailyItem = await MenuItem.findOne({ name: "DAILY HOME-MADE THALI", storeId: store._id });
    if (!dailyItem) {
        dailyItem = await MenuItem.create({
            storeId: store._id,
            name: "DAILY HOME-MADE THALI",
            price: 89,
            category: "Homemade Food",
            description: "Daily special homemade thali",
            foodType: "veg"
        });
    }

    // Sunday Item creation logic removed as per request
    // let sundayItem = await MenuItem.findOne({ name: "Sunday Special Thali", storeId: store._id });
    // if (!sundayItem) {
    //     sundayItem = await MenuItem.create({
    //         storeId: store._id,
    //         name: "Sunday Special Thali",
    //         price: 120, // Default base price
    //         category: "Homemade Food",
    //         description: "Sunday special treat",
    //         foodType: "veg"
    //     });
    // }

    return { store, dailyItem };
};

// --- CORE BUSINESS LOGIC ---

// 1. Get Today's Menu (Public)
exports.getTodayMenu = catchAsync(async (req, res, next) => {
    const todayStr = getTodayDateString();
    const dayName = getDayName();

    let menu = await DailyMenu.findOne({ date: todayStr });

    // Auto-create if not exists (Auto Reset Logic)
    if (!menu) {
        menu = await DailyMenu.create({
            date: todayStr,
            dayOfWeek: dayName,
            weekdayMenu: {
                lunchSabji: 'Aloo Pyaj', // Default
                dinnerSabji: 'Sev Tamatar' // Default
            }
        });
    }

    const now = getIndianTime();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Slot Logic
    // Lunch: Preorder close 12:00 PM
    let isLunchOpen = false;
    if (currentHour < 12 || (currentHour === 11 && currentMinute <= 59)) {
        isLunchOpen = true;
    }
    // Strict cut-off
    if (currentHour >= 12) isLunchOpen = false;

    // Dinner: Preorder close 7:00 PM
    let isDinnerOpen = false;
    if (currentHour < 19) isDinnerOpen = true;

    // Response formatting based on Day
    let responseData = {
        date: menu.date,
        day: menu.dayOfWeek,
        isSunday: menu.dayOfWeek === 'Sunday',
        slots: {
            lunch: {
                isOpen: isLunchOpen,
                deliveryTime: "1:00–2:00 PM",
                message: isLunchOpen ? "Preorders Open" : "Preorders Closed"
            },
            dinner: {
                isOpen: isDinnerOpen,
                deliveryTime: "7:00–8:00 PM",
                message: isDinnerOpen ? "Preorders Open" : "Preorders Closed"
            }
        }
    };

    if (menu.dayOfWeek === 'Sunday') {
        const specialName = menu.sundayMenu.specialItemName || "Special Surprise";
        responseData.product = {
            name: "Sunday Special Thali",
            itemName: specialName,
            price: menu.sundayMenu.price || 120,
            includes: ["Special Preparation", "Dessert", "Accompaniments"],
            description: specialName
        };
        // Sunday Dinner Rule
        if (!menu.sundayMenu.isDinnerSlotOpen) {
            responseData.slots.dinner.isOpen = false;
            responseData.slots.dinner.message = "No Dinner Service Today";
        }
        // Include availableRotis for Sunday if configured (using weekdayMenu storage)
        responseData.product.availableRotis = menu.weekdayMenu.availableRotis || [];
    } else {
        responseData.product = {
            name: "DAILY HOME-MADE THALI",
            price: menu.weekdayMenu.fixedPrice || 89,
            includes: menu.weekdayMenu.fixedItems || ['Chulhe ki Roti', 'Salad', 'Lahsun Chutney', 'Desi Chhach'],
            lunchSabji: menu.weekdayMenu.lunchSabji,
            dinnerSabji: menu.weekdayMenu.dinnerSabji,
            availableRotis: menu.weekdayMenu.availableRotis || [],
            extraRotiPrice: menu.weekdayMenu.extraRotiPrice || 10
        };
    }

    res.status(200).json({
        success: true,
        data: responseData
    });
});

// 2. Admin Update Menu
exports.updateMenu = catchAsync(async (req, res, next) => {
    // Allow updating future dates
    const targetDate = req.body.date || getTodayDateString();
    let menu = await DailyMenu.findOne({ date: targetDate });

    // Auto-create if not exists (for future dates)
    if (!menu) {
        // Need to determine day of week for the target date
        const dateObj = new Date(targetDate);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[dateObj.getDay()];

        menu = await DailyMenu.create({
            date: targetDate,
            dayOfWeek: dayName,
            weekdayMenu: {
                lunchSabji: 'Upcoming Lunch',
                dinnerSabji: 'Upcoming Dinner'
            }
        });
    }

    if (!menu) {
        return next(new AppError('Daily menu not initialized', 404));
    }

    const {
        lunchSabji,
        dinnerSabji,
        weekdayPrice,
        weekdayItems,
        sundayItemName,
        sundayPrice,
        sundayDinnerOpen,
        extraRotiPrice
    } = req.body;

    if (menu.dayOfWeek !== 'Sunday') {
        // Weekday: All fields editable now
        if (lunchSabji) menu.weekdayMenu.lunchSabji = lunchSabji;
        if (dinnerSabji) menu.weekdayMenu.dinnerSabji = dinnerSabji;
        if (weekdayPrice) menu.weekdayMenu.fixedPrice = weekdayPrice;
        if (weekdayItems) menu.weekdayMenu.fixedItems = weekdayItems;
        if (extraRotiPrice) menu.weekdayMenu.extraRotiPrice = extraRotiPrice;
        if (req.body.availableRotis) {
            menu.weekdayMenu.availableRotis = req.body.availableRotis;
        }
    } else {
        // Sunday: Item, Price, Slots
        if (sundayItemName) menu.sundayMenu.specialItemName = sundayItemName;
        if (sundayPrice) menu.sundayMenu.price = sundayPrice;
        if (sundayDinnerOpen !== undefined) menu.sundayMenu.isDinnerSlotOpen = sundayDinnerOpen;

        // Allow updating rotis on Sunday too (stored in weekdayMenu structure for simplicity)
        if (req.body.availableRotis) {
            menu.weekdayMenu.availableRotis = req.body.availableRotis;
        }
    }

    await menu.save();

    res.status(200).json({
        success: true,
        message: 'Menu updated successfully',
        data: menu
    });
});

// 3. Place Order (Strict Rules)
exports.placeOrder = catchAsync(async (req, res, next) => {
    const todayStr = getTodayDateString();
    const menu = await DailyMenu.findOne({ date: todayStr });

    if (!menu) return next(new AppError('Menu not open for today', 400));

    const { customerName, mobileNumber, area, customAddress, quantity, slot } = req.body;

    // Basic Validation
    if (!customerName || !mobileNumber || !area || !quantity || !slot) {
        return next(new AppError('All fields are required', 400));
    }

    if (!customAddress) {
        return next(new AppError('Detailed address is required', 400));
    }

    const now = getIndianTime();
    const currentHour = now.getHours();

    // 9 AM Start Time Check
    if (currentHour < 9) {
        return next(new AppError('Pre-orders open at 9:00 AM', 400));
    }

    // Slot Validation & Time Check
    if (slot === 'Lunch') {
        if (currentHour >= 12) return next(new AppError('Lunch preorders closed (Cutoff: 12:00 PM)', 400));
    } else if (slot === 'Dinner') {
        if (menu.dayOfWeek === 'Sunday' && !menu.sundayMenu.isDinnerSlotOpen) {
            return next(new AppError('Dinner slot is closed for today', 400));
        }
        if (currentHour >= 19) return next(new AppError('Dinner preorders closed (Cutoff: 7:00 PM)', 400));
    } else {
        return next(new AppError('Invalid slot', 400));
    }

    // Determine Item & Price
    const refs = await ensureReferences();
    let selectedMenuItem;
    let finalPrice = 0;

    if (menu.dayOfWeek === 'Sunday') {
        selectedMenuItem = refs.sundayItem;
        const sundayPrice = menu.sundayMenu.price || 120;
        finalPrice = sundayPrice * quantity;
    } else {
        selectedMenuItem = refs.dailyItem;
        // Use dynamic price from DB, default to 89 if missing
        const dailyPrice = menu.weekdayMenu.fixedPrice || 89;
        finalPrice = dailyPrice * quantity;
    }

    // Create Order
    const order = await Order.create({
        userId: req.user ? req.user._id : new mongoose.Types.ObjectId(), // Valid ID placeholder
        storeId: refs.store._id,
        storeId: refs.store._id,
        deliveryAddress: {
            street: `${customAddress}, ${area}`,
            city: 'Jaipur',
            pincode: '303002',
            label: 'Home'
        },
        items: [{
            menuItemId: selectedMenuItem._id,
            itemName: selectedMenuItem.name,
            quantity: quantity,
            itemPrice: finalPrice / quantity,
        }],
        totalAmount: finalPrice,
        finalPrice: finalPrice, // Schema requires this
        paymentMethod: 'cash_on_delivery',
        status: 'Pending',
        metadata: {
            dailyMenuDate: todayStr,
            isHomemade: true,
            customerName: customerName,
            customerPhone: mobileNumber,
            mealType: slot
        }
    });

    // Update Stats
    if (slot === 'Lunch') menu.stats.lunchOrders += quantity;
    if (slot === 'Dinner') menu.stats.dinnerOrders += quantity;
    menu.stats.revenue += finalPrice;
    await menu.save();

    // Send Notification Email
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@tommalu.com'; // Fallback
        await emailService.sendHomemadeFoodOrderNotification(adminEmail, {
            orderNumber: order._id.toString().slice(-6).toUpperCase(), // Simulating nice ID
            customerName,
            mobileNumber,
            foodName: selectedMenuItem.name,
            quantity,
            finalAmount: finalPrice,
            deliveryAddress: {
                street: customAddress,
                landmark: area, // Using area as landmark context
                city: 'Jaipur',
                pincode: '303002'
            },
            specialInstructions: slot === 'Lunch' ? 'Lunch Slot' : 'Dinner Slot'
        });
    } catch (emailErr) {
        console.error("Failed to send email notification:", emailErr);
        // Don't fail the request, just log it
    }

    res.status(201).json({
        success: true,
        data: {
            orderId: order._id,
            mealType: slot,
            plates: quantity,
            deliveryTime: slot === 'Lunch' ? '1:00–2:00 PM' : '7:30–9:00 PM',
            paymentMode: 'COD (Cash on Delivery)',
            totalAmount: finalPrice
        }
    });
});

// 4. Admin Dashboard Stats
exports.getDashboardStats = catchAsync(async (req, res, next) => {
    const todayStr = getTodayDateString();

    // Find or create today's menu to ensure stats exist
    let menu = await DailyMenu.findOne({ date: todayStr });

    if (!menu) {
        return res.status(200).json({ success: true, data: { lunch: 0, dinner: 0, revenue: 0, customers: [] } });
    }

    // Fetch actual orders for detailed list
    const orders = await Order.find({
        'metadata.dailyMenuDate': todayStr,
        'metadata.isHomemade': true
    })
        .sort({ createdAt: -1 });

    const customerList = orders.map(o => ({
        id: o._id,
        name: o.metadata.customerName || "Unknown",
        phone: o.metadata.customerPhone || "Unknown",
        area: o.deliveryAddress.street || "Unknown",
        plates: o.items.reduce((acc, i) => acc + i.quantity, 0),
        mealType: o.metadata.mealType || "Unknown",
        amount: o.finalPrice,
        status: o.status
    }));

    res.status(200).json({
        success: true,
        data: {
            stats: {
                lunchCount: menu.stats.lunchOrders, // These might be inflated with potential fakes if synced directly, but OK for now
                dinnerCount: menu.stats.dinnerOrders,
                totalRevenue: menu.stats.revenue
            },
            customers: customerList
        }
    });
});

// 5. Confirm Order
exports.confirmOrder = catchAsync(async (req, res, next) => {
    const order = await Order.findById(req.params.id);
    if (!order) return next(new AppError('Order not found', 404));

    if (order.status !== 'Pending') {
        return next(new AppError('Order is not pending', 400));
    }

    order.status = 'Confirmed';
    await order.save();

    res.status(200).json({
        success: true,
        message: 'Order confirmed successfully'
    });
});

// ==========================================
// Generic CRUD for Food Items & Orders (Merged)
// ==========================================

const { HomemadeFood, HomemadeFoodOrder } = require('../models/homemadeFood');
const APIFeatures = require('../utils/apiFeatures');

exports.getAllHomemadeFoods = catchAsync(async (req, res, next) => {
    const features = new APIFeatures(HomemadeFood.find(), req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();

    const foods = await features.query;
    const total = await HomemadeFood.countDocuments(features.queryString || {});

    res.status(200).json({
        success: true,
        total,
        data: foods
    });
});

exports.createHomemadeFood = catchAsync(async (req, res, next) => {
    const newFood = await HomemadeFood.create(req.body);
    res.status(201).json({
        success: true,
        data: newFood
    });
});

exports.updateHomemadeFood = catchAsync(async (req, res, next) => {
    const food = await HomemadeFood.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });

    if (!food) {
        return next(new AppError('No food item found with that ID', 404));
    }

    res.status(200).json({
        success: true,
        data: food
    });
});

exports.deleteHomemadeFood = catchAsync(async (req, res, next) => {
    const food = await HomemadeFood.findByIdAndDelete(req.params.id);

    if (!food) {
        return next(new AppError('No food item found with that ID', 404));
    }

    res.status(204).json({
        success: true,
        data: null
    });
});

// 5. Orders Management (Merged & Enhanced)
exports.getAllOrders = catchAsync(async (req, res, next) => {
    const { status, page = 1, limit = 20, startDate, endDate, search } = req.query;
    // Order model is already imported at top

    // 1. Build Filters
    console.log(`🔍 [Admin] Fetching Orders. Query Params:`, req.query);
    const homemadeFilter = {};
    const orderFilter = { 'metadata.isHomemade': true };

    // Status Filter
    if (status && status !== 'all') {
        homemadeFilter.status = status;
        const statusMap = {
            'pending': 'Pending', 'confirmed': 'Confirmed', 'delivered': 'Delivered',
            'cancelled': 'Cancelled', 'out_for_delivery': 'OutForDelivery',
            'preparing': 'preparing', 'ready': 'ready'
        };
        orderFilter.status = statusMap[status] || status;
    }

    // Type Filter (Subscription vs Daily Meal)
    const { type } = req.query;
    if (type === 'subscription') {
        orderFilter['metadata.isSubscription'] = true;
        // Legacy orders don't strictly have isSubscription, so maybe exclude them or assume they aren't
        // homemadeFilter... (Legacy didn't have subs)
    } else if (type === 'meal') {
        orderFilter['metadata.isSubscription'] = { $ne: true };
    }

    // Date Filter
    if (startDate || endDate) {
        homemadeFilter.createdAt = {};
        orderFilter.createdAt = {};
        if (startDate) {
            homemadeFilter.createdAt.$gte = new Date(startDate);
            orderFilter.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
            homemadeFilter.createdAt.$lte = new Date(endDate);
            orderFilter.createdAt.$lte = new Date(endDate);
        }
    }

    // Search Filter
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        homemadeFilter.$or = [
            { customerName: searchRegex },
            { mobileNumber: searchRegex },
            { orderNumber: searchRegex }
        ];
        orderFilter.$or = [
            { 'metadata.customerName': searchRegex },
            { 'metadata.customerPhone': searchRegex }
        ];
    }

    // 2. Fetch from both
    const [legacyOrders, newOrders] = await Promise.all([
        HomemadeFoodOrder.find(homemadeFilter).sort({ createdAt: -1 }).lean(),
        Order.find(orderFilter).sort({ createdAt: -1 }).lean()
    ]);
    console.log(`📊 [Admin] Found ${legacyOrders.length} Legacy Orders, ${newOrders.length} New Orders`);

    // 3. Map to Unified Format
    const mappedLegacy = legacyOrders.map(o => ({
        _id: o._id,
        source: 'legacy',
        orderNumber: o.orderNumber || o._id.toString().slice(-6).toUpperCase(),
        customerName: o.customerName,
        mobileNumber: o.mobileNumber,
        foodName: o.foodName || 'Homemade Item',
        quantity: o.quantity,
        finalAmount: o.finalAmount,
        status: o.status.toLowerCase(),
        createdAt: o.createdAt,
        deliveryAddress: o.deliveryAddress,
        adminNotes: o.adminNotes || '',
        specialInstructions: o.specialInstructions
    }));

    const mappedNew = newOrders.map(o => {
        let simpleFoodName = 'Homemade Thali';
        if (o.metadata?.mealType) simpleFoodName = `${o.metadata.mealType} Thali`;
        else if (o.items?.[0]?.itemName) simpleFoodName = o.items[0].itemName;

        return {
            _id: o._id,
            source: 'new',
            orderNumber: o.orderNumber || o._id.toString().slice(-6).toUpperCase(),
            customerName: o.metadata?.customerName || 'Unknown',
            mobileNumber: o.metadata?.customerPhone || 'Unknown',
            foodName: simpleFoodName,
            quantity: o.items?.[0]?.quantity || 1,
            finalAmount: o.finalPrice,
            deliveryCharge: o.deliveryCharge || 0,
            status: o.status.toLowerCase(),
            createdAt: o.createdAt,
            deliveryAddress: o.deliveryAddress,
            adminNotes: o.metadata?.adminNotes || '',
            specialInstructions: o.metadata?.mealType
        };
    });

    // 4. Merge and Sort
    const allOrders = [...mappedLegacy, ...mappedNew].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 5. Pagination (In-Memory)
    const total = allOrders.length;
    const p = parseInt(page);
    const l = parseInt(limit);
    const paginatedOrders = allOrders.slice((p - 1) * l, p * l);

    res.status(200).json({
        success: true,
        pagination: {
            page: p,
            limit: l,
            total,
            pages: Math.ceil(total / l)
        },
        data: paginatedOrders
    });
});

exports.getOrderById = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    // Try New Order first
    let order = await Order.findById(id).lean();
    let source = 'new';

    if (!order) {
        // Try Legacy Order
        order = await HomemadeFoodOrder.findById(id).populate('userId', 'name email phone').lean();
        source = 'legacy';
    }

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    let formattedOrder;
    if (source === 'new') {
        let simpleFoodName = 'Homemade Thali';
        if (order.metadata?.mealType) simpleFoodName = `${order.metadata.mealType} Thali`;
        else if (order.items?.[0]?.itemName) simpleFoodName = order.items[0].itemName;

        formattedOrder = {
            _id: order._id,
            orderNumber: order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
            customerName: order.metadata?.customerName || 'Unknown',
            mobileNumber: order.metadata?.customerPhone || 'Unknown',
            email: order.metadata?.email || '',
            foodName: simpleFoodName,
            quantity: order.items?.[0]?.quantity || 1,
            finalAmount: order.finalPrice,
            deliveryCharge: order.deliveryCharge || 0,
            status: order.status.toLowerCase(),
            createdAt: order.createdAt,
            deliveryAddress: order.deliveryAddress,
            specialInstructions: order.metadata?.mealType,
            adminNotes: order.metadata?.adminNotes || order.rejectionReason || ''
        };
    } else {
        formattedOrder = {
            _id: order._id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            mobileNumber: order.mobileNumber,
            email: order.email,
            foodName: order.foodName || order.foodItem?.name,
            quantity: order.quantity,
            finalAmount: order.finalAmount,
            deliveryCharge: order.deliveryCharge,
            status: order.status.toLowerCase(),
            createdAt: order.createdAt,
            deliveryAddress: order.deliveryAddress,
            specialInstructions: order.specialInstructions,
            adminNotes: order.adminNotes
        };
    }

    res.status(200).json({
        success: true,
        data: formattedOrder
    });
});

exports.updateOrderStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    // Try finding in New Orders
    let order = await Order.findById(id);
    let source = 'new';

    if (!order) {
        // Try Legacy
        order = await HomemadeFoodOrder.findById(id);
        source = 'legacy';
    }

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    // Update Logic
    order.status = status;

    if (source === 'new') {
        if (adminNotes) {
            if (!order.metadata) order.metadata = {};
            order.metadata.adminNotes = adminNotes;
            order.markModified('metadata');
        }
    } else {
        if (adminNotes) order.adminNotes = adminNotes;
    }

    await order.save();

    // Return formatted
    const formattedOrder = {
        _id: order._id,
        orderNumber: order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
        status: order.status.toLowerCase(),
        adminNotes: source === 'new' ? order.metadata?.adminNotes : order.adminNotes
    };

    res.status(200).json({
        success: true,
        data: formattedOrder,
        message: "Order status updated successfully"
    });
});

exports.trackOrder = catchAsync(async (req, res, next) => {
    const { orderNumber, mobileNumber } = req.query;

    if (!orderNumber || !mobileNumber) {
        return next(new AppError('Order number and mobile number are required', 400));
    }

    // Try New Order
    // Note: orderNumber in DB (new) might be storing just ID slice or full UUID.
    // The previous logic generated slice(-6).toUpperCase().
    // We should probably search by _id if orderNumber is length 24, otherwise ???
    // Legacy logic usually stored explicit orderNumber.
    // New logic in `placeOrder`: `orderNumber` field is NOT explicitly saved in `Order` schema usually?
    // Let's check `placeOrder` (line 255): It does NOT save `orderNumber` in `Order.create`.
    // It relies on `_id` in response: `orderNumber: order._id.toString().slice(-6).toUpperCase()`.
    // So tracking by "Order Number" (short) is hard unless we store it.
    // BUT `getAllOrders` maps `orderNumber` using `_id`.
    // So here we should probably accept `orderNumber` as the short code and match it against `_id`?
    // Or users provide full ID?
    // Let's assume user provides full ID or we try to match last 6 chars of _id.
    // Matching last 6 chars in Mongo is hard without regex.
    // Let's try finding by ID if valid ObjectId.

    let order;
    let source = '';

    // If orderNumber is valid ObjectId
    if (mongoose.isValidObjectId(orderNumber)) {
        order = await Order.findById(orderNumber);
        if (order) source = 'new';
        else {
            order = await HomemadeFoodOrder.findById(orderNumber);
            if (order) source = 'legacy';
        }
    }

    // If not found by ID, try legacy orderNumber field
    if (!order) {
        order = await HomemadeFoodOrder.findOne({ orderNumber: orderNumber });
        if (order) source = 'legacy';
    }

    // If still not found and orderNumber is short, maybe try regex on _id? (Expensive but okay for tracking)
    // Actually, let's skip fuzzy matching for now to be safe. "Order Number" in UI usually refers to ID or custom field.

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Verify Mobile Number
    let phoneMatch = false;
    if (source === 'new') {
        const storedPhone = order.metadata?.customerPhone || '';
        if (storedPhone === mobileNumber) phoneMatch = true;
    } else {
        if (order.mobileNumber === mobileNumber) phoneMatch = true;
    }

    if (!phoneMatch) {
        return next(new AppError('Mobile number does not match order records', 401));
    }

    const response = {
        orderNumber: orderNumber,
        status: order.status,
        amount: source === 'new' ? order.finalPrice : order.finalAmount,
        items: source === 'new'
            ? order.items.map(i => `${i.quantity}x ${i.itemName}`).join(', ')
            : `${order.quantity}x ${order.foodName}`,
        createdAt: order.createdAt
    };

    res.status(200).json({
        success: true,
        data: response
    });
});

exports.getAnalytics = catchAsync(async (req, res, next) => {
    const { startDate, endDate } = req.query;

    const buildMatchStage = (start, end) => {
        const query = { 'metadata.isHomemade': true };
        if (start || end) {
            query.createdAt = {};
            if (start) query.createdAt.$gte = new Date(start);
            if (end) query.createdAt.$lte = new Date(end);
        }
        return query;
    };

    // 1. Overall Stats (Total Orders, Total Revenue)
    const overallStats = await Order.aggregate([
        { $match: { 'metadata.isHomemade': true } },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$finalPrice' }
            }
        }
    ]);

    // 2. Today's Stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayStats = await Order.aggregate([
        { $match: buildMatchStage(todayStart, todayEnd) },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$finalPrice' },
                lunchOrders: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Lunch'] }, 1, 0] }
                },
                dinnerOrders: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Dinner'] }, 1, 0] }
                },
                lunchRevenue: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Lunch'] }, '$finalPrice', 0] }
                },
                dinnerRevenue: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Dinner'] }, '$finalPrice', 0] }
                }
            }
        }
    ]);

    // 3. Monthly Stats (Current Month)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyStats = await Order.aggregate([
        { $match: buildMatchStage(monthStart, new Date()) },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$finalPrice' },
                lunchOrders: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Lunch'] }, 1, 0] }
                },
                dinnerOrders: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Dinner'] }, 1, 0] }
                },
                lunchRevenue: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Lunch'] }, '$finalPrice', 0] }
                },
                dinnerRevenue: {
                    $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Dinner'] }, '$finalPrice', 0] }
                }
            }
        }
    ]);

    // 4. Order Status Breakdown (All Time or filtered by date if provided)
    const statusStats = await Order.aggregate([
        { $match: buildMatchStage(startDate, endDate) },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                revenue: { $sum: '$finalPrice' }
            }
        }
    ]);

    // 5. Daily Trend (Last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyTrend = await Order.aggregate([
        { $match: buildMatchStage(sevenDaysAgo, new Date()) },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                lunch: { $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Lunch'] }, 1, 0] } },
                dinner: { $sum: { $cond: [{ $eq: ['$metadata.mealType', 'Dinner'] }, 1, 0] } },
                revenue: { $sum: '$finalPrice' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
        success: true,
        data: {
            overall: overallStats[0] || { totalOrders: 0, totalRevenue: 0 },
            today: todayStats[0] || { totalOrders: 0, totalRevenue: 0, lunchOrders: 0, dinnerOrders: 0, lunchRevenue: 0, dinnerRevenue: 0 },
            monthly: monthlyStats[0] || { totalOrders: 0, totalRevenue: 0, lunchOrders: 0, dinnerOrders: 0, lunchRevenue: 0, dinnerRevenue: 0 },
            statusBreakdown: statusStats,
            dailyTrend
        }
    });
});
