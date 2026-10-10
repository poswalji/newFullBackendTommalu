const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0, 'Amount cannot be negative']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['Groceries', 'Logistics', 'Packaging', 'Rent', 'Salary', 'Marketing', 'Maintenance', 'Other']
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    expenseDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    recordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'UPI', 'Bank Transfer', 'Credit Card'],
        default: 'Cash'
    }
}, {
    timestamps: true
});

// Index for faster queries in analytics
expenseSchema.index({ expenseDate: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
