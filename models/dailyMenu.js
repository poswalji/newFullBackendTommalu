const mongoose = require('mongoose');

const dailyMenuSchema = new mongoose.Schema({
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true,
        unique: true
    },
    dayOfWeek: {
        type: String,
        enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        required: true
    },
    // Weekday Configuration
    weekdayMenu: {
        lunchSabji: { type: String, default: '' },
        dinnerSabji: { type: String, default: '' },
        fixedPrice: { type: Number, default: 89 },
        fixedItems: {
            type: [String],
            default: ['Chulhe ki Roti', 'Salad', 'Lahsun Chutney', 'Desi Chhach']
        }
    },
    // Sunday Configuration
    sundayMenu: {
        specialItemName: { type: String, default: '' },
        price: { type: Number, default: 0 }, // Admin editable
        isDinnerSlotOpen: { type: Boolean, default: false } // Admin toggle
    },
    // Stats (Denormalized for quick access, or computed)
    stats: {
        lunchOrders: { type: Number, default: 0 },
        dinnerOrders: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model('DailyMenu', dailyMenuSchema);
