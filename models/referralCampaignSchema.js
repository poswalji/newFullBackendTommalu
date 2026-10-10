const mongoose = require('mongoose');

const referralCampaignSchema = new mongoose.Schema({
    name: {
        type: String,
        default: 'Default Referral Campaign',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    referrerReward: {
        type: Number,
        default: 100, // ₹100
        min: 0,
        required: true
    },
    newSubscriberDiscount: {
        type: Number,
        default: 50, // ₹50
        min: 0,
        required: true
    },
    minSubscriptionDuration: {
        type: Number,
        default: 30, // 30 days minimum
        min: 1
    },
    eligiblePlanTypes: [{
        type: String,
        enum: ['lunch', 'dinner', 'both'],
        default: ['lunch', 'dinner', 'both']
    }],
    maxReferralsPerUser: {
        type: Number,
        default: 0 // 0 means unlimited
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ReferralCampaign', referralCampaignSchema);
