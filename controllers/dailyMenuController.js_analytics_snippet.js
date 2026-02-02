
// 6. Analytics (New)
exports.getAnalytics = catchAsync(async (req, res, next) => {
    // 1. Calculate Date Ranges
    const today = new Date();
    const last30Days = new Date(today);
    last30Days.setDate(today.getDate() - 30);

    // Aggregation Pipeline for Revenue & Orders per Day (Last 30 Days)
    const dailyStats = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: last30Days },
                'metadata.isHomemade': true,
                status: { $ne: 'Cancelled' }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                orders: { $sum: 1 },
                revenue: { $sum: "$finalPrice" }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Overall Totals
    const totalStats = await Order.aggregate([
        {
            $match: {
                'metadata.isHomemade': true,
                status: { $ne: 'Cancelled' }
            }
        },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$finalPrice" },
                avgOrderValue: { $avg: "$finalPrice" }
            }
        }
    ]);

    // Popular Items (from metadata.orderedItems usually, but items array is better)
    // Note: items array in Order schema structure: items: [{ itemName, quantity }]
    // We unwind items to count them.
    const popularItems = await Order.aggregate([
        { $match: { 'metadata.isHomemade': true, status: { $ne: 'Cancelled' } } },
        { $unwind: "$items" },
        {
            $group: {
                _id: "$items.itemName",
                count: { $sum: "$items.quantity" }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);

    res.status(200).json({
        success: true,
        data: {
            daily: dailyStats,
            total: totalStats[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
            popularItems
        }
    });
});
