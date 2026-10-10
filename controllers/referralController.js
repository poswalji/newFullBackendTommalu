const User = require('../models/user');
const Referral = require('../models/referralSchema');
const ReferralCampaign = require('../models/referralCampaignSchema');
const RewardLedger = require('../models/rewardLedgerSchema');
const Subscription = require('../models/subscriptionSchema');
const catchAsync = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const mongoose = require('mongoose');

// ==========================================
// CUSTOMER APIs
// ==========================================

// GET /api/referrals/my-stats
// Returns user's referral code, balance, and stats
exports.getMyReferralStats = catchAsync(async (req, res, next) => {
    let user = await User.findById(req.user._id);
    
    // Auto-generate if missing (backward compatibility)
    if (!user.referralCode) {
        user = await user.save();
    }

    const referrals = await Referral.find({ referrerId: user._id })
        .populate('referredUserId', 'name createdAt')
        .sort('-createdAt');

    const qualifiedReferrals = referrals.filter(r => r.status === 'rewarded').length;
    const pendingReferrals = referrals.filter(r => r.status === 'pending' || r.status === 'qualified').length;
    const totalEarned = referrals.filter(r => r.status === 'rewarded').reduce((acc, curr) => acc + curr.referrerRewardAmount, 0);

    const ledger = await RewardLedger.find({ userId: user._id })
        .sort('-createdAt')
        .limit(20);

    // Active Campaign Info
    const campaign = await ReferralCampaign.findOne({ isActive: true });

    res.status(200).json({
        success: true,
        data: {
            referralCode: user.referralCode,
            walletBalance: user.tokens, // Reusing tokens field as wallet
            stats: {
                totalReferrals: referrals.length,
                qualifiedReferrals,
                pendingReferrals,
                totalEarned
            },
            referrals: referrals.map(r => ({
                id: r._id,
                friendName: r.referredUserId ? r.referredUserId.name : 'Unknown',
                date: r.createdAt,
                status: r.status,
                reward: r.referrerRewardAmount
            })),
            ledger,
            campaign: campaign ? {
                referrerReward: campaign.referrerReward,
                newSubscriberDiscount: campaign.newSubscriberDiscount,
                minSubscriptionDuration: campaign.minSubscriptionDuration
            } : null
        }
    });
});

// POST /api/referrals/validate-code
// Validates code for frontend before checkout
exports.validateReferralCode = catchAsync(async (req, res, next) => {
    const { code } = req.body;
    
    if (!code) {
        return next(new AppError('Please provide a referral code', 400));
    }

    const campaign = await ReferralCampaign.findOne({ isActive: true });
    if (!campaign) {
        return next(new AppError('No active referral campaigns currently', 400));
    }

    const referrer = await User.findOne({ referralCode: code.toUpperCase() });
    
    if (!referrer) {
        return next(new AppError('Invalid referral code', 404));
    }

    // Prevent self referral
    if (referrer._id.toString() === req.user._id.toString()) {
        return next(new AppError('You cannot use your own referral code', 400));
    }

    // Check if user has ever had a subscription before
    const previousSub = await Subscription.findOne({ userId: req.user._id });
    if (previousSub) {
        return next(new AppError('Referral codes are only valid for first-time subscriptions', 400));
    }

    // Check if user is already being referred in a pending state
    const existingPending = await Referral.findOne({ referredUserId: req.user._id });
    if (existingPending) {
         return next(new AppError('You have already applied a referral code', 400));
    }

    res.status(200).json({
        success: true,
        message: 'Referral code valid',
        data: {
            referrerName: referrer.name,
            discountAmount: campaign.newSubscriberDiscount
        }
    });
});

// ==========================================
// ADMIN APIs
// ==========================================

// GET /api/admin/referrals/campaign
exports.getCampaign = catchAsync(async (req, res, next) => {
    let campaign = await ReferralCampaign.findOne({ isActive: true });
    if (!campaign) {
        // Return latest even if inactive, or a default structure
        campaign = await ReferralCampaign.findOne().sort('-createdAt');
    }
    res.status(200).json({ success: true, data: campaign });
});

// PUT /api/admin/referrals/campaign
exports.updateCampaign = catchAsync(async (req, res, next) => {
    const { referrerReward, newSubscriberDiscount, isActive, minSubscriptionDuration } = req.body;
    
    let campaign = await ReferralCampaign.findOne({ isActive: true });
    
    if (campaign) {
        campaign.referrerReward = referrerReward !== undefined ? referrerReward : campaign.referrerReward;
        campaign.newSubscriberDiscount = newSubscriberDiscount !== undefined ? newSubscriberDiscount : campaign.newSubscriberDiscount;
        campaign.isActive = isActive !== undefined ? isActive : campaign.isActive;
        campaign.minSubscriptionDuration = minSubscriptionDuration !== undefined ? minSubscriptionDuration : campaign.minSubscriptionDuration;
        await campaign.save();
    } else {
        campaign = await ReferralCampaign.create(req.body);
    }
    
    res.status(200).json({ success: true, data: campaign });
});

// GET /api/admin/referrals/ledger
exports.getRewardLedger = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 20 } = req.query;
    
    const ledger = await RewardLedger.find()
        .populate('userId', 'name email')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit * 1);
        
    const total = await RewardLedger.countDocuments();
    
    res.status(200).json({
        success: true,
        data: ledger,
        pagination: { total, page: Number(page), pages: Math.ceil(total / limit) }
    });
});

// GET /api/admin/referrals/conversions
exports.getAllReferrals = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 20, status } = req.query;
    
    const query = {};
    if (status) query.status = status;

    const referrals = await Referral.find(query)
        .populate('referrerId', 'name email referralCode')
        .populate('referredUserId', 'name email')
        .populate('subscriptionId', 'planName status price')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit * 1);
        
    const total = await Referral.countDocuments(query);
    
    res.status(200).json({
        success: true,
        data: referrals,
        pagination: { total, page: Number(page), pages: Math.ceil(total / limit) }
    });
});
