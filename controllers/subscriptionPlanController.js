const SubscriptionPlan = require('../models/subscriptionPlanSchema');
const catchAsync = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// 1. Get All Plans (Public) - Only active ones? Or all? Usually public needs active.
exports.getPlans = catchAsync(async (req, res, next) => {
    const now = new Date(); // Time is critical here

    // Logic: isActive is TRUE.
    // AND: (startDate is missing/null OR startDate <= now)
    // AND: (endDate is missing/null OR endDate >= now)
    const plans = await SubscriptionPlan.find({
        isActive: true,
        $and: [
            { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] }
        ]
    });

    res.status(200).json({
        success: true,
        count: plans.length,
        data: plans
    });
});

// 2. Get All Plans (Admin)
exports.getAllPlansAdmin = catchAsync(async (req, res, next) => {
    const plans = await SubscriptionPlan.find({});
    res.status(200).json({
        success: true,
        data: plans
    });
});

// 3. Create Plan (Admin)
exports.createPlan = catchAsync(async (req, res, next) => {
    // Constraint removed to allow multiple plans (e.g. different months)
    // const existing = await SubscriptionPlan.findOne({ planType: req.body.planType });
    // if (existing) {
    //     return next(new AppError(`Plan for type ${req.body.planType} already exists. Update it instead.`, 400));
    // }

    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json({
        success: true,
        data: plan
    });
});

// 4. Update Plan (Admin)
exports.updatePlan = catchAsync(async (req, res, next) => {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });

    if (!plan) return next(new AppError('Plan not found', 404));

    res.status(200).json({
        success: true,
        data: plan
    });
});

// ... previous code ...
exports.deletePlan = catchAsync(async (req, res, next) => {
    const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);
    if (!plan) return next(new AppError('Plan not found', 404));

    res.status(204).json({
        success: true,
        data: null
    });
});

// 6. Purchase Subscription
const Order = require('../models/orderSchema'); // Ensure this is imported
const emailService = require('../utils/emailService'); // Ensure this is imported

exports.purchaseSubscription = catchAsync(async (req, res, next) => {
    const { planId, customerName, mobileNumber, area, customAddress } = req.body;

    // 1. Find Plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return next(new AppError('Subscription Plan not found', 404));
    if (!plan.isActive) return next(new AppError('This plan is no longer active', 400));

    // 2. Create Order
    // Note: Store ID should be dynamic or fixed for Homemade. Using hardcoded or finding store?
    // Using a placeholder store ID or finding the Tommalu Home Kitchen store.
    const Store = require('../models/store');
    const store = await Store.findOne({ storeName: "Tommalu Home Kitchen" });
    if (!store) return next(new AppError('Store not found', 500));

    const order = await Order.create({
        userId: req.user ? req.user._id : undefined, // Optional user link
        storeId: store._id,
        deliveryAddress: {
            street: `${customAddress}, ${area}`,
            city: 'Jaipur',
            pincode: '302001',
            label: 'Home'
        },
        items: [{
            itemName: plan.title, // Use plan title as item name
            quantity: 1,
            itemPrice: plan.price
        }],
        totalAmount: plan.price,
        finalPrice: plan.price,
        paymentMethod: 'cash_on_delivery', // Default for now
        status: 'Pending',
        metadata: {
            isHomemade: true,
            isSubscription: true,
            planId: plan._id,
            planType: plan.planType,
            customerName,
            customerPhone: mobileNumber,
            startDate: plan.startDate,
            endDate: plan.endDate
        }
    });

    // 3. Email Notification (Optional)
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@tommalu.com';
        await emailService.sendHomemadeFoodOrderNotification(adminEmail, {
            orderNumber: order._id.toString().slice(-6).toUpperCase(),
            customerName,
            mobileNumber,
            foodName: `SUBSCRIPTION: ${plan.title}`,
            quantity: 1,
            finalAmount: plan.price,
            deliveryAddress: { street: customAddress, landmark: area, city: 'Jaipur', pincode: '302001' },
            specialInstructions: `Plan Type: ${plan.planType}`
        });
    } catch (err) {
        console.error('Email failed', err);
    }

    res.status(201).json({
        success: true,
        message: 'Subscription request received',
        data: order
    });
});
