const mapStatus = (status) => {
    if (!status) return 'NEW';
    const s = status.toLowerCase();
    switch (s) {
        case 'pending':
        case 'payment_pending':
        case 'payment_received':
            return 'NEW';
        case 'confirmed':
            return 'ACCEPTED';
        case 'preparing':
            return 'PREPARING';
        case 'ready':
            return 'READY';
        case 'out_for_delivery':
        case 'outfordelivery':
            return 'OUT_FOR_DELIVERY';
        case 'delivered':
            return 'DELIVERED';
        case 'cancelled':
        case 'refund_initiated':
        case 'refund_completed':
            return 'CANCELLED';
        case 'rejected':
            return 'REJECTED';
        default:
            return s.toUpperCase();
    }
};

const mapStatusToOriginal = (normalizedStatus, source) => {
    if (!normalizedStatus) return source === 'legacy' ? 'pending' : 'Pending';
    // Clean string: remove underscores, hyphens, and spaces to match easily
    const clean = normalizedStatus.toString().trim().toLowerCase().replace(/[\s_-]+/g, '');

    if (source === 'legacy') {
        switch (clean) {
            case 'new':
            case 'pending':
            case 'paymentpending':
            case 'paymentreceived':
                return 'pending';
            case 'accepted':
            case 'confirmed':
                return 'confirmed';
            case 'preparing':
                return 'preparing';
            case 'ready':
                return 'ready';
            case 'outfordelivery':
                return 'out_for_delivery';
            case 'delivered':
                return 'delivered';
            case 'cancelled':
            case 'refundinitiated':
            case 'refundcompleted':
                return 'cancelled';
            case 'rejected':
                return 'cancelled';
            default:
                return 'pending';
        }
    } else {
        // New Order schema enum matches exact casing required:
        // "Pending", "Confirmed", "OutForDelivery", "Delivered", "Cancelled", "Rejected", "preparing", "ready"
        switch (clean) {
            case 'new':
            case 'pending':
            case 'paymentpending':
            case 'paymentreceived':
                return 'Pending';
            case 'accepted':
            case 'confirmed':
                return 'Confirmed';
            case 'preparing':
                return 'preparing';
            case 'ready':
                return 'ready';
            case 'outfordelivery':
                return 'OutForDelivery';
            case 'delivered':
                return 'Delivered';
            case 'cancelled':
            case 'refundinitiated':
            case 'refundcompleted':
                return 'Cancelled';
            case 'rejected':
                return 'Rejected';
            default:
                // If it's already one of the valid enums, preserve it instead of blindly resetting to Pending
                return normalizedStatus;
        }
    }
};

const normalizeLegacyOrder = (o) => ({
    _id: o._id, // frontend expects _id
    id: o._id,
    source: 'legacy',
    orderNumber: o.orderNumber || o._id.toString().slice(-6).toUpperCase(),
    customer: {
        name: o.customerName || 'Unknown',
        phone: o.mobileNumber || 'Unknown',
        email: o.email || '',
    },
    // legacy flat fields for frontend compatibility
    customerName: o.customerName || 'Unknown',
    mobileNumber: o.mobileNumber || 'Unknown',
    foodName: o.foodName || 'Homemade Item',
    quantity: o.quantity || 1,
    finalAmount: o.finalAmount || o.totalAmount,

    items: [{
        name: o.foodName || 'Homemade Item',
        quantity: o.quantity || 1,
        price: o.pricePerUnit || o.finalAmount
    }],
    total: o.finalAmount,
    deliveryCharge: o.deliveryCharge || 0,
    status: mapStatus(o.status),
    originalStatus: o.status,
    
    // Area mapping
    area: getAreaFromAddress(o.deliveryAddress),
    deliveryAddress: o.deliveryAddress,
    
    mealType: determineMealType(o),
    paymentMethod: o.paymentMethod || 'cash_on_delivery',
    paymentStatus: o.paymentStatus || 'pending',
    deliveryBoy: null,
    createdAt: o.createdAt,
    adminNotes: o.adminNotes || '',
    cancellationReason: o.cancellationReason || '',
    specialInstructions: o.specialInstructions || ''
});

const normalizeNewOrder = (o) => {
    let simpleFoodName = 'Homemade Thali';
    if (o.metadata?.mealType) simpleFoodName = `${o.metadata.mealType} Thali`;
    else if (o.items?.[0]?.itemName) simpleFoodName = o.items[0].itemName;

    let items = o.items?.map(i => ({
        name: i.itemName,
        quantity: i.quantity,
        price: i.itemPrice
    })) || [{
        name: simpleFoodName,
        quantity: o.quantity || 1, // some new orders might have flat quantity
        price: o.finalPrice
    }];

    return {
        _id: o._id, // frontend expects _id
        id: o._id,
        source: 'new',
        orderNumber: o.orderNumber || o._id.toString().slice(-6).toUpperCase(),
        customer: {
            name: o.metadata?.customerName || 'Unknown',
            phone: o.metadata?.customerPhone || 'Unknown',
            email: o.metadata?.email || '',
        },
        // flat fields for frontend compatibility
        customerName: o.metadata?.customerName || 'Unknown',
        mobileNumber: o.metadata?.customerPhone || 'Unknown',
        foodName: simpleFoodName,
        quantity: o.items?.[0]?.quantity || 1,
        finalAmount: o.finalPrice,

        items: items,
        total: o.finalPrice,
        deliveryCharge: o.deliveryCharge || 0,
        status: mapStatus(o.status),
        originalStatus: o.status,
        
        area: o.area || getAreaFromAddress(o.deliveryAddress),
        deliveryAddress: o.deliveryAddress,
        
        mealType: o.timeSlot || o.metadata?.mealType || 'Lunch',
        paymentMethod: o.paymentMethod || 'cash_on_delivery',
        paymentStatus: o.paymentStatus || (o.paymentId ? 'received' : 'pending'),
        deliveryBoy: o.assignedTo || null,
        createdAt: o.createdAt,
        adminNotes: o.metadata?.adminNotes || o.rejectionReason || '',
        cancellationReason: o.cancellationReason || '',
        specialInstructions: o.metadata?.orderedItems || ''
    };
};

function getAreaFromAddress(addr) {
    if (!addr) return 'other';
    const combined = `${addr.street} ${addr.landmark} ${addr.city}`.toLowerCase();
    if (combined.includes('nims')) return 'nims';
    if (combined.includes('achrol')) return 'achrol';
    if (combined.includes('chomu')) return 'chomu';
    return 'other';
}

function determineMealType(o) {
    if (o.preferredDeliverySlot === 'afternoon') return 'Lunch';
    if (o.preferredDeliverySlot === 'evening') return 'Dinner';
    
    // Attempt to guess by foodName or specialInstructions
    const text = `${o.foodName} ${o.specialInstructions}`.toLowerCase();
    if (text.includes('dinner')) return 'Dinner';
    return 'Lunch'; // default
}

module.exports = {
    normalizeLegacyOrder,
    normalizeNewOrder,
    mapStatus,
    mapStatusToOriginal
};
