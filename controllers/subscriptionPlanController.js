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
            // { $or: [{ startDate: ... }] }, // REMOVED: Allow future plans to be seen/subscribed
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
    // DEPRECATED: Subscription purchase should purely create a Subscription Request, not an Order.
    // Use POST /api/subscriptions/request instead.

    return next(new AppError('This endpoint is deprecated. Use /api/subscriptions/request to submit a subscription request.', 410));
});
