const mongoose = require('mongoose');

const rewardLedgerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    transactionType: {
        type: String,
        enum: ['earned', 'redeemed', 'expired', 'reversed', 'admin_adjustment'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    referenceModel: {
        type: String,
        enum: ['Referral', 'Subscription', 'Order', 'Admin'],
        required: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    balanceAfter: {
        type: Number
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RewardLedger', rewardLedgerSchema);
