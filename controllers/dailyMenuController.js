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
    return d.toISOString().split('T')[0];
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

    let sundayItem = await MenuItem.findOne({ name: "Sunday Special Thali", storeId: store._id });
    if (!sundayItem) {
        sundayItem = await MenuItem.create({
            storeId: store._id,
            name: "Sunday Special Thali",
            price: 120, // Default base price
            category: "Homemade Food",
            description: "Sunday special treat",
            foodType: "veg"
        });
    }

    return { store, dailyItem, sundayItem };
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
    } else {
        responseData.product = {
            name: "DAILY HOME-MADE THALI",
            price: menu.weekdayMenu.fixedPrice || 89,
            includes: menu.weekdayMenu.fixedItems || ['Chulhe ki Roti', 'Salad', 'Lahsun Chutney', 'Desi Chhach'],
            lunchSabji: menu.weekdayMenu.lunchSabji,
            dinnerSabji: menu.weekdayMenu.dinnerSabji
        };
    }

    res.status(200).json({
        success: true,
        data: responseData
    });
});

// 2. Admin Update Menu
exports.updateMenu = catchAsync(async (req, res, next) => {
    const todayStr = getTodayDateString();
    let menu = await DailyMenu.findOne({ date: todayStr });

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
        sundayDinnerOpen
    } = req.body;

    if (menu.dayOfWeek !== 'Sunday') {
        // Weekday: All fields editable now
        if (lunchSabji) menu.weekdayMenu.lunchSabji = lunchSabji;
        if (dinnerSabji) menu.weekdayMenu.dinnerSabji = dinnerSabji;
        if (weekdayPrice) menu.weekdayMenu.fixedPrice = weekdayPrice;
        if (weekdayItems) menu.weekdayMenu.fixedItems = weekdayItems;
    } else {
        // Sunday: Item, Price, Slots
        if (sundayItemName) menu.sundayMenu.specialItemName = sundayItemName;
        if (sundayPrice) menu.sundayMenu.price = sundayPrice;
        if (sundayDinnerOpen !== undefined) menu.sundayMenu.isDinnerSlotOpen = sundayDinnerOpen;
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
            pincode: '302001',
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
                pincode: '302001'
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
            deliveryTime: slot === 'Lunch' ? '1:00–2:00 PM' : '7:00–8:00 PM',
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

// Orders Management (Generic List)
exports.getAllOrders = catchAsync(async (req, res, next) => {
    const features = new APIFeatures(HomemadeFoodOrder.find(), req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();

    const orders = await features.query;
    const total = await HomemadeFoodOrder.countDocuments(features.queryString || {});

    res.status(200).json({
        success: true,
        pagination: {
            total,
            page: req.query.page * 1 || 1,
            limit: req.query.limit * 1 || 10,
            pages: Math.ceil(total / (req.query.limit * 1 || 10))
        },
        data: orders
    });
});

exports.getOrderById = catchAsync(async (req, res, next) => {
    const order = await HomemadeFoodOrder.findById(req.params.id);

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    res.status(200).json({
        success: true,
        data: order
    });
});

exports.updateOrderStatus = catchAsync(async (req, res, next) => {
    const { status, adminNotes } = req.body;

    const order = await HomemadeFoodOrder.findByIdAndUpdate(
        req.params.id,
        { status, adminNotes },
        { new: true, runValidators: true }
    );

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    res.status(200).json({
        success: true,
        data: order
    });
});

exports.getAnalytics = catchAsync(async (req, res, next) => {
    // Basic aggregation for dashboard
    const stats = await HomemadeFoodOrder.aggregate([
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$finalAmount' },
                avgOrderValue: { $avg: '$finalAmount' },
                totalDelivered: {
                    $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                },
                totalPending: {
                    $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                }
            }
        }
    ]);

    const summary = stats.length > 0 ? stats[0] : {
        totalOrders: 0,
        totalRevenue: 0,
        avgOrderValue: 0,
        totalDelivered: 0,
        totalPending: 0
    };

    res.status(200).json({
        success: true,
        data: {
            summary
        }
    });
});
