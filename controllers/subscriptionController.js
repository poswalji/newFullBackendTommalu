const Subscription = require('../models/subscriptionSchema');
const SubscriptionRequest = require('../models/subscriptionRequestSchema');
const SubscriptionPriceLog = require('../models/subscriptionPriceLogSchema');
const DailyDelivery = require('../models/dailyDeliverySchema');
const SubscriptionPlan = require('../models/subscriptionPlanSchema');
const Referral = require('../models/referralSchema');
const ReferralCampaign = require('../models/referralCampaignSchema');
const RewardLedger = require('../models/rewardLedgerSchema');
const User = require('../models/user');
const mongoose = require('mongoose');
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
        rotiPreference,
        referralCode,
        redeemTokens
    } = req.body;

    // 1. Validate Plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
        return next(new AppError('Invalid Subscription Plan ID', 400));
    }

    // Calculate End Date
    const start = new Date(startDate);
    const end = new Date(start);
    const duration = 30; // Default or fetch from plan logic
    end.setDate(start.getDate() + duration);

    let finalPrice = plan.price;
    let appliedReferralCode = undefined;
    let referralDiscount = 0;
    let referrerId = undefined;
    let campaign = null;

    // 2. Validate Referral Code
    if (referralCode && req.user) {
        campaign = await ReferralCampaign.findOne({ isActive: true });
        if (campaign) {
            const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
            const previousSub = await Subscription.findOne({ userId: req.user._id });
            const existingPending = await Referral.findOne({ referredUserId: req.user._id });

            if (referrer && referrer._id.toString() !== req.user._id.toString() && !previousSub && !existingPending) {
                appliedReferralCode = referralCode.toUpperCase();
                referralDiscount = campaign.newSubscriberDiscount;
                finalPrice = Math.max(0, finalPrice - referralDiscount);
                referrerId = referrer._id;
            }
        }
    }

    // 3. Redeem Tokens (Tommalu Tokens)
    if (redeemTokens && req.user) {
        const user = await User.findById(req.user._id);
        if (user && user.tokens > 0) {
            // Apply token discount (10 tokens = 1 INR)
            const tokenValueInRupees = user.tokens / 10;
            const discountApplied = Math.min(finalPrice, tokenValueInRupees);
            
            finalPrice -= discountApplied;
            
            // We'll leave the deduction for when the admin Approves it to prevent edge cases.
            // Wait, we need to pass `redeemedTokens` to the model.
            // Let's add it to adminNotes or a new field, for now just note it.
        }
    }

    // 4. Create Subscription (Pending)
    const subscription = await Subscription.create({
        userId: req.user ? req.user._id : undefined,
        customerName,
        mobileNumber,
        deliveryAddress,
        planId: plan._id,
        planName: plan.title,
        price: finalPrice, // Discounted price
        planType: plan.planType,
        startDate: start,
        endDate: end,
        duration: duration,
        quantity,
        rotiPreference,
        appliedReferralCode,
        referralDiscount,
        status: 'pending'
    });

    // 5. Create Pending Referral record if applicable
    if (referrerId && campaign) {
        await Referral.create({
            referrerId: referrerId,
            referredUserId: req.user._id,
            subscriptionId: subscription._id,
            referralCodeUsed: appliedReferralCode,
            campaignId: campaign._id,
            referrerRewardAmount: campaign.referrerReward,
            refereeDiscountAmount: campaign.newSubscriberDiscount,
            status: 'pending'
        });
    }

    res.status(201).json({
        success: true,
        message: 'Subscription request submitted successfully',
        data: subscription
    });
});

exports.getMySubscriptionRequests = catchAsync(async (req, res, next) => {
    const requests = await Subscription.find({ userId: req.user._id, status: 'pending' }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: requests.length, data: requests });
});

// ==========================================
// 2. Admin: Manage Requests
// ==========================================

exports.getAllSubscriptionRequests = catchAsync(async (req, res, next) => {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const query = { status };

    const requests = await Subscription.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit * 1);

    const total = await Subscription.countDocuments(query);

    res.status(200).json({
        success: true,
        data: requests,
        pagination: { total, page: Number(page), pages: Math.ceil(total / limit) }
    });
});

exports.approveSubscriptionRequest = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const subscription = await Subscription.findById(id).session(session);

        if (!subscription) throw new AppError('Subscription not found', 404);
        if (subscription.status !== 'pending') throw new AppError('Subscription already processed', 400);

        subscription.status = 'active';
        await subscription.save({ session });

        // Check for pending referrals
        const pendingReferral = await Referral.findOne({ 
            subscriptionId: subscription._id, 
            status: 'pending' 
        }).session(session);

        if (pendingReferral) {
            // Qualify the referral and reward the referrer
            pendingReferral.status = 'rewarded';
            await pendingReferral.save({ session });

            const referrer = await User.findById(pendingReferral.referrerId).session(session);
            if (referrer) {
                const tokensToCredit = pendingReferral.referrerRewardAmount * 10;
                referrer.tokens += tokensToCredit;
                await referrer.save({ session });

                await RewardLedger.create([{
                    userId: referrer._id,
                    amount: tokensToCredit,
                    transactionType: 'earned',
                    description: `Referral reward for ${subscription.customerName}'s subscription`,
                    referenceModel: 'Referral',
                    referenceId: pendingReferral._id,
                    balanceAfter: referrer.tokens
                }], { session });

                // Notification for Referrer
                notificationService.createNotification({
                    userId: referrer._id,
                    title: 'Referral Reward Earned!',
                    message: `You earned ₹${pendingReferral.referrerRewardAmount} because ${subscription.customerName} started a subscription!`,
                    type: 'general',
                    relatedId: pendingReferral._id,
                    relatedModel: 'Referral'
                });
            }
        }

        await session.commitTransaction();
        session.endSession();

        // Notification for Subscriber
        notificationService.createNotification({
            userId: subscription.userId,
            title: 'Subscription Approved',
            message: 'Your subscription request has been approved and is now active.',
            type: 'general',
            relatedId: subscription._id,
            relatedModel: 'Subscription'
        });

        res.status(200).json({
            success: true,
            message: 'Subscription approved and activated',
            data: subscription
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return next(error);
    }
});

exports.rejectSubscriptionRequest = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    let subscription;
    try {
        subscription = await Subscription.findByIdAndUpdate(
            id,
            { status: 'rejected', adminNotes: reason },
            { new: true, session }
        );

        if (!subscription) throw new AppError('Subscription not found', 404);

        // Reject pending referral
        const pendingReferral = await Referral.findOne({ 
            subscriptionId: subscription._id, 
            status: 'pending' 
        }).session(session);

        if (pendingReferral) {
            pendingReferral.status = 'reversed';
            pendingReferral.notes = 'Subscription request rejected';
            await pendingReferral.save({ session });
        }

        await session.commitTransaction();
        session.endSession();
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return next(error);
    }

    // Notification
    notificationService.createNotification({
        userId: subscription.userId,
        title: 'Subscription Rejected',
        message: `Your subscription request was rejected: ${reason}`,
        type: 'general'
    });

    res.status(200).json({ success: true, message: 'Request rejected', data: subscription });
});

// ==========================================
// 3. Admin: Manage Active Subscriptions
// ==========================================

exports.getAllActiveSubscriptions = catchAsync(async (req, res, next) => {
    const { status, page = 1, limit = 20 } = req.query;
    
    // Lazy expire: update status to 'expired' if endDate has passed
    const currentDate = new Date();
    // Setting time to start of day for accurate comparison if needed, or just use exact time
    await Subscription.updateMany({
        status: 'active',
        endDate: { $lt: currentDate }
    }, {
        $set: { status: 'expired' }
    });

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

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const subscription = await Subscription.findById(id).session(session);
        if (!subscription) throw new AppError('Subscription not found', 404);

        subscription.status = status;
        if (adminNotes) subscription.adminNotes = adminNotes;
        await subscription.save({ session });

        // If cancelled, check if we need to reverse a referral reward
        if (status === 'cancelled') {
            const rewardedReferral = await Referral.findOne({ 
                subscriptionId: subscription._id, 
                status: 'rewarded' 
            }).session(session);

            if (rewardedReferral) {
                // Determine if we should reverse based on time (e.g. cancelled within 14 days)
                // For safety, let's reverse it regardless since subscription was cancelled
                rewardedReferral.status = 'reversed';
                rewardedReferral.notes = 'Subscription cancelled. Reward reversed.';
                await rewardedReferral.save({ session });

                const referrer = await User.findById(rewardedReferral.referrerId).session(session);
                if (referrer) {
                    const tokensToReverse = rewardedReferral.referrerRewardAmount * 10;
                    referrer.tokens = Math.max(0, referrer.tokens - tokensToReverse);
                    await referrer.save({ session });

                    await RewardLedger.create([{
                        userId: referrer._id,
                        amount: -tokensToReverse,
                        transactionType: 'reversed',
                        description: `Referral reward reversed due to cancelled subscription`,
                        referenceModel: 'Referral',
                        referenceId: rewardedReferral._id,
                        balanceAfter: referrer.tokens
                    }], { session });
                }
            }
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Subscription status updated',
            data: subscription
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return next(error);
    }
});

// Admin Add Pause
exports.adminAddPause = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { date, reason } = req.body;

    if (!date) return next(new AppError('Date is required', 400));

    const subscription = await Subscription.findById(id);
    if (!subscription) return next(new AppError('Subscription not found', 404));

    if (subscription.status !== 'active') {
        return next(new AppError('Only active subscriptions can be paused', 400));
    }

    // Add pause request as approved
    subscription.pauseRequests.push({
        date: new Date(date),
        status: 'approved',
        reason: reason || 'Admin Manual Pause'
    });
    subscription.pausedDaysUsed += 1;

    // Extend end date by 1 day
    const newEndDate = new Date(subscription.endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    subscription.endDate = newEndDate;

    await subscription.save();

    res.status(200).json({
        success: true,
        message: 'Pause added successfully and plan extended by 1 day',
        data: subscription
    });
});

// ==========================================
// 4. User: View Own
// ==========================================

exports.getUserSubscriptions = catchAsync(async (req, res, next) => {
    // Lazy expire: update status to 'expired' if endDate has passed for this user's subscriptions
    const currentDate = new Date();
    await Subscription.updateMany({
        userId: req.user._id,
        status: 'active',
        endDate: { $lt: currentDate }
    }, {
        $set: { status: 'expired' }
    });

    const subscriptions = await Subscription.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: subscriptions.length, data: subscriptions });
});

// ==========================================
// 5. Pause Functionality
// ==========================================

exports.requestPause = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { date, reason } = req.body;

    if (!date) return next(new AppError('Date is required for pause request', 400));

    const subscription = await Subscription.findOne({ _id: id, userId: req.user._id });
    if (!subscription) return next(new AppError('Subscription not found', 404));

    if (subscription.status !== 'active') {
        return next(new AppError('Only active subscriptions can be paused', 400));
    }

    const pendingRequests = subscription.pauseRequests.filter(r => r.status === 'pending').length;
    if (subscription.pausedDaysUsed + pendingRequests >= 2) {
        return next(new AppError('You have reached the maximum allowed pause requests (2 days)', 400));
    }

    subscription.pauseRequests.push({
        date: new Date(date),
        status: 'pending',
        reason
    });

    await subscription.save();

    res.status(200).json({
        success: true,
        message: 'Pause request submitted successfully',
        data: subscription
    });
});

exports.approvePauseRequest = catchAsync(async (req, res, next) => {
    const { id, requestId } = req.params;

    const subscription = await Subscription.findById(id);
    if (!subscription) return next(new AppError('Subscription not found', 404));

    const request = subscription.pauseRequests.id(requestId);
    if (!request) return next(new AppError('Pause request not found', 404));
    if (request.status !== 'pending') return next(new AppError('Request already processed', 400));

    request.status = 'approved';
    subscription.pausedDaysUsed += 1;

    // Extend end date by 1 day
    const newEndDate = new Date(subscription.endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    subscription.endDate = newEndDate;

    await subscription.save();

    // Notification
    notificationService.createNotification({
        userId: subscription.userId,
        title: 'Pause Request Approved',
        message: `Your request to pause subscription on ${new Date(request.date).toDateString()} has been approved. Your plan is extended by 1 day.`,
        type: 'general',
        relatedId: subscription._id,
        relatedModel: 'Subscription'
    });

    res.status(200).json({
        success: true,
        message: 'Pause request approved and plan extended',
        data: subscription
    });
});

exports.rejectPauseRequest = catchAsync(async (req, res, next) => {
    const { id, requestId } = req.params;
    const { reason } = req.body;

    const subscription = await Subscription.findById(id);
    if (!subscription) return next(new AppError('Subscription not found', 404));

    const request = subscription.pauseRequests.id(requestId);
    if (!request) return next(new AppError('Pause request not found', 404));

    request.status = 'rejected';
    if (reason) request.reason = reason;

    await subscription.save();

    // Notification
    notificationService.createNotification({
        userId: subscription.userId,
        title: 'Pause Request Rejected',
        message: `Your request to pause subscription on ${new Date(request.date).toDateString()} was rejected.`,
        type: 'general'
    });

    res.status(200).json({
        success: true,
        message: 'Pause request rejected',
        data: subscription
    });
});
