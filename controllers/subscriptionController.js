const Subscription = require('../models/subscriptionSchema');
const SubscriptionRequest = require('../models/subscriptionRequestSchema');
const SubscriptionPriceLog = require('../models/subscriptionPriceLogSchema');
const DailyDelivery = require('../models/dailyDeliverySchema');
const SubscriptionPlan = require('../models/subscriptionPlanSchema');
const catchAsync = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const notificationService = require('../services/notificationService');

// ==========================================
// 1. Subscription Requests (Public/User)
// ==========================================

exports.createSubscriptionRequest = catchAsync(async (req, res, next) => {
    const {
        planId,
        customerName,
        mobileNumber,
        deliveryAddress,
        startDate,
        quantity,
        rotiPreference
    } = req.body;

    // 1. Validate Plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
        return next(new AppError('Invalid Subscription Plan ID', 400));
    }

    // 2. Create Request
    const subscriptionRequest = await SubscriptionRequest.create({
        userId: req.user ? req.user._id : undefined,
        customerName,
        mobileNumber,
        deliveryAddress,
        planId: plan._id,
        planName: plan.title,
        price: plan.price,
        planType: plan.planType,
        startDate: new Date(startDate),
        quantity,
        rotiPreference,
        status: 'pending'
    });

    // Notify Admin (Implementation dependent on notification system)
    // notificationService.notifyAdminNewSubscriptionRequest(subscriptionRequest);

    res.status(201).json({
        success: true,
        message: 'Subscription request submitted successfully',
        data: subscriptionRequest
    });
});

exports.getMySubscriptionRequests = catchAsync(async (req, res, next) => {
    const requests = await SubscriptionRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: requests.length, data: requests });
});

// ==========================================
// 2. Admin: Manage Requests
// ==========================================

exports.getAllSubscriptionRequests = catchAsync(async (req, res, next) => {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;

    const requests = await SubscriptionRequest.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit * 1);

    const total = await SubscriptionRequest.countDocuments(query);

    res.status(200).json({
        success: true,
        data: requests,
        pagination: { total, page: Number(page), pages: Math.ceil(total / limit) }
    });
});

exports.approveSubscriptionRequest = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const request = await SubscriptionRequest.findById(id);

    if (!request) return next(new AppError('Request not found', 404));
    if (request.status !== 'pending') return next(new AppError('Request already processed', 400));

    // Calculate End Date
    const start = new Date(request.startDate);
    const end = new Date(start);
    const duration = 30; // Default or fetch from plan logic
    end.setDate(start.getDate() + duration);

    // create Active Subscription
    const newSubscription = await Subscription.create({
        userId: request.userId,
        customerName: request.customerName,
        mobileNumber: request.mobileNumber,
        deliveryAddress: request.deliveryAddress,
        planId: request.planId,
        planName: request.planName,
        price: request.price,
        planType: request.planType,
        startDate: start,
        endDate: end,
        duration: duration,
        quantity: request.quantity,
        rotiPreference: request.rotiPreference,
        status: 'active'
    });

    // Update Request Status
    request.status = 'approved';
    await request.save();

    // Notification
    notificationService.createNotification({
        userId: request.userId,
        title: 'Subscription Approved',
        message: 'Your subscription request has been approved and is now active.',
        type: 'general',
        relatedId: newSubscription._id,
        relatedModel: 'Subscription'
    });

    res.status(200).json({
        success: true,
        message: 'Subscription approved and activated',
        data: newSubscription
    });
});

exports.rejectSubscriptionRequest = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body;

    const request = await SubscriptionRequest.findByIdAndUpdate(
        id,
        { status: 'rejected', rejectionReason: reason },
        { new: true }
    );

    if (!request) return next(new AppError('Request not found', 404));

    // Notification
    notificationService.createNotification({
        userId: request.userId,
        title: 'Subscription Rejected',
        message: `Your subscription request was rejected: ${reason}`,
        type: 'general'
    });

    res.status(200).json({ success: true, message: 'Request rejected', data: request });
});

// ==========================================
// 3. Admin: Manage Active Subscriptions
// ==========================================

exports.getAllActiveSubscriptions = catchAsync(async (req, res, next) => {
    const { status, page = 1, limit = 20 } = req.query;
    // Default to showing active, paused, expired. Exclude 'pending' as they are in requests.
    const query = {};
    if (status && status !== 'all') {
        query.status = status;
    } else {
        query.status = { $in: ['active', 'paused', 'expired', 'cancelled'] };
    }

    const subscriptions = await Subscription.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit * 1);

    const total = await Subscription.countDocuments(query);

    res.status(200).json({
        success: true,
        data: subscriptions,
        pagination: { total, page: Number(page), pages: Math.ceil(total / limit) }
    });
});

// Update Duration (Period)
exports.updateSubscriptionPeriod = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { startDate, endDate } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) return next(new AppError('Subscription not found', 404));

    // Validation: Changes apply ONLY to future deliveries (Implied by logic, but we update the contract dates here)
    // Past deliveries are in `daily_deliveries` (or orders) and won't be touched by this date change unless we regenerate.
    // Important: We are NOT regenerating past here.

    const oldEndDate = subscription.endDate;

    // Check if dates are being provided
    if (startDate) subscription.startDate = new Date(startDate);
    if (endDate) subscription.endDate = new Date(endDate);

    // Recalculate duration if both present or just for sanity
    const start = new Date(subscription.startDate);
    const end = new Date(subscription.endDate);
    const diffTime = Math.abs(end - start);
    subscription.duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    await subscription.save();

    // 🔔 Notification
    notificationService.createNotification({
        userId: subscription.userId,
        title: 'Subscription Validity Updated',
        message: `Your subscription validity has been updated till ${end.toDateString()}.`,
        type: 'general',
        relatedId: subscription._id,
        relatedModel: 'Subscription'
    });

    res.status(200).json({
        success: true,
        message: 'Subscription period updated',
        data: subscription
    });
});

// Update Price
exports.updateSubscriptionPrice = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { newPrice } = req.body;

    if (!newPrice) return next(new AppError('New price is required', 400));

    const subscription = await Subscription.findById(id);
    if (!subscription) return next(new AppError('Subscription not found', 404));

    const oldPrice = subscription.price;
    subscription.price = newPrice;
    await subscription.save();

    // Log the change
    try {
        await SubscriptionPriceLog.create({
            subscriptionId: subscription._id,
            oldPrice,
            newPrice,
            updatedBy: req.user._id,
            reason: 'Admin manual update'
        });
    } catch (logErr) {
        console.error("Failed to create price log:", logErr);
        // Ensure we don't crash the request if logging fails
    }

    // 🔔 Notification
    notificationService.createNotification({
        userId: subscription.userId,
        title: 'Subscription Price Updated',
        message: 'Your subscription price has been updated. Please check details.',
        type: 'general',
        relatedId: subscription._id,
        relatedModel: 'Subscription'
    });

    res.status(200).json({
        success: true,
        message: 'Price updated successfully',
        data: subscription
    });
});

// Toggle Status (Pause/Resume/Cancel)
exports.updateSubscriptionStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body; // active, paused, cancelled

    const subscription = await Subscription.findByIdAndUpdate(
        id,
        { status, adminNotes },
        { new: true, runValidators: true }
    );

    if (!subscription) return next(new AppError('Subscription not found', 404));

    res.status(200).json({
        success: true,
        message: 'Subscription status updated',
        data: subscription
    });
});

// ==========================================
// 4. User: View Own
// ==========================================

exports.getUserSubscriptions = catchAsync(async (req, res, next) => {
    const subscriptions = await Subscription.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: subscriptions.length, data: subscriptions });
});
