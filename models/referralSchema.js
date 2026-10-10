const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    referredUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
        unique: true // A user can only be referred once
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true
    },
    referralCodeUsed: {
        type: String,
        required: true
    },
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ReferralCampaign'
    },
    status: {
        type: String,
        enum: ['pending', 'qualified', 'rewarded', 'reversed'],
        default: 'pending'
    },
    referrerRewardAmount: {
        type: Number,
        required: true
    },
    refereeDiscountAmount: {
        type: Number,
        required: true
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Referral', referralSchema);
