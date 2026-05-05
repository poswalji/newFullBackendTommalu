// const Order=require("../models/orderSchema");
// const asyncHandler=require('../utils/asyncHandler');
// const AppError=require('../utils/appError');   
// const User=require("../models/user");
// const Menu=require("../models/menuItems");
// const Store=require("../models/store");
// exports.createOrder=asyncHandler(async(req,res,next)=>{
//     const  {userId,items,discount,promoCode,finalPrice,deliveryAddress}=req.body;
//     if(  !userId || !items || items.length===0 || finalPrice<=0){
//         return next(new AppError('something Went Wrong',400));
//     }
//     // console.log(items);

//  const menuItem = await Menu.findById(items[0].menuId); 
// if (!menuItem) {
//   throw new Error("Menu item not found");
// }

// const storeId = menuItem.storeId;
// console.log("Menu Item:", menuItem);
// console.log("Store ID:", storeId);

//     const user=await User.findById(userId);
//     if( user.role!=='customer'){
//         return next(new AppError('Invalid customer ID',400));
//     }       
//     const newOrder=await Order.create({storeId,userId,items,discount,promoCode,finalPrice,deliveryAddress});
//     res.status(201).json({
//         status:'success',
//         data:{
//             order:newOrder
//         }
//     });
// }   ); 



// exports.getCustomerOrders=asyncHandler(async(req,res,next)=>{
//     const customerId=req.params.customerId;
//     const user=await  User.findById(customerId).populate({
//         path: 'orders',
//         select: 'items finalPrice status createdAt deliveryAddress',
//     }
//     );
//     if(!user || user.role!=='customer'){
//         return next(new AppError('Customer not found',404));
//     }           
//     res.status(200).json({
//         status:'success',
//         data:{    

//              totalOrders:user.orders.length,
//             orders:user.orders
//         }
//     }); 
// }   );

// exports.updateOrderStatus = asyncHandler(async (req, res,next) => {
//     const orderId = req.params.orderId;
//     // const storeId = req.params.storeId;
//     const { status } = req.body; 
//     // const store = await Store.findById(storeId);
//     // if (!store) {
//     //     return next(new AppError('Store not found', 404));
//     // }   

//     // for auth  so only stotre owner can update the order status
//     // if (store.ownerId.toString() !== req.params.storeId) {
//     //     return next(new AppError('Not authorized to update orders for this store', 403));
//     // }
//     const order = await Order.findOneAndUpdate(     { _id: orderId},
//         { status },
//         { new: true, runValidators: true }
//     );      
//     if (!order) {   

//         return next(new AppError('Order not found for this store', 404));
//     }       
//     res.status(200).json({
//         success: true,
//         order,
//     }); 
// });
const mongoose = require('mongoose');
const Order = require("../models/orderSchema");
const Promotion = require('../models/promotion');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const User = require("../models/user");
const Menu = require("../models/menuItems");
const Store = require("../models/store");
const Cart = require("../models/cartSchema");
const Payment = require("../models/payment");
const notificationService = require('../services/notificationService');
const { calculateFinalAmount } = require('./cartController');
const { isStoreOpen } = require('../utils/storeUtils');

// ✅ CREATE ORDER - Fixed to use authenticated user with fraud detection
exports.createOrder = asyncHandler(async (req, res, next) => {
    // Use req.user._id from authentication instead of req.body.userId
    const { items, discount, promoCode, finalPrice, deliveryAddress } = req.body;
    const userId = req.user._id; // ✅ From authentication middleware

    if (!items || items.length === 0 || finalPrice <= 0) {
        return next(new AppError('Missing required fields or invalid data', 400));
    }

    // Get storeId from the first menu item (support menuItemId or menuId)
    const firstItem = items[0] || {};
    const firstMenuId = firstItem.menuItemId || firstItem.menuId;
    const menuItem = await Menu.findById(firstMenuId);
    if (!menuItem) {
        return next(new AppError("Menu item not found", 404));
    }

    // Ensure storeId is an ObjectId, not a populated object
    const storeId = menuItem.storeId?._id || menuItem.storeId;
    if (!storeId) {
        return next(new AppError('Store ID not found for menu item', 400));
    }

    // ✅ CHECK IF STORE IS OPEN
    const store = await Store.findById(storeId);
    if (!store) {
        return next(new AppError('Store not found', 404));
    }

    const storeStatus = isStoreOpen(store);
    if (!storeStatus.isOpen) {
        return next(new AppError(`Store is currently closed: ${storeStatus.reason}. Please try again later.`, 400));
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('User not found', 400));
    }

    // ✅ FRAUD DETECTION (skip in test environment)
    const fraudFlags = [];

    // Skip fraud detection in test environment
    if (process.env.NODE_ENV !== 'test') {
        // 1. Check for multiple recent cancelled orders
        const recentCancelled = await Order.countDocuments({
            userId,
            status: 'Cancelled',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        });

        if (recentCancelled > 3) {
            fraudFlags.push({
                type: 'high_cancellation_rate',
                severity: 'high',
                message: `User has ${recentCancelled} cancelled orders in last 24 hours`
            });
        }

        // 2. Check for abnormal order value (very high)
        const avgOrderValue = await Order.aggregate([
            { $match: { userId } },
            { $group: { _id: null, avg: { $avg: '$finalPrice' } } }
        ]);
        const userAvgOrderValue = avgOrderValue[0]?.avg || 0;

        if (finalPrice > userAvgOrderValue * 5 && userAvgOrderValue > 0) {
            fraudFlags.push({
                type: 'abnormal_order_value',
                severity: 'medium',
                message: `Order value ${finalPrice} is significantly higher than user average ${userAvgOrderValue}`
            });
        }

        // 3. Check for rapid successive orders (potential bot/spam)
        const recentOrders = await Order.countDocuments({
            userId,
            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
        });

        if (recentOrders > 10) {
            fraudFlags.push({
                type: 'rapid_ordering',
                severity: 'high',
                message: `User placed ${recentOrders} orders in the last hour`
            });
        }

        // 4. Check for multiple rejected orders
        const recentRejected = await Order.countDocuments({
            userId,
            status: 'Rejected',
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        });

        if (recentRejected > 5) {
            fraudFlags.push({
                type: 'high_rejection_rate',
                severity: 'medium',
                message: `User has ${recentRejected} rejected orders in last 7 days`
            });
        }
    }

    // 5. Check if user account is suspended
    if (user.status === 'suspended') {
        return next(new AppError('Your account is suspended. Please contact support.', 403));
    }

    // If high severity fraud detected, block order
    const highSeverityFraud = fraudFlags.filter(f => f.severity === 'high');
    if (highSeverityFraud.length > 0) {
        // Log fraud attempt
        // TODO: Create fraud detection log entry

        return next(new AppError('Order flagged for review due to suspicious activity. Please contact support.', 403));
    }

    // ✅ VALIDATE PROMOTION CODE IF PROVIDED
    let validatedDiscount = discount || 0;
    let validatedPromoCode = promoCode || null;

    if (promoCode) {
        // Calculate order amount before discount for validation
        const itemsTotal = items.reduce((sum, item) => {
            return sum + (Number(item.itemPrice) || 0) * (Number(item.quantity) || 1);
        }, 0);

        // Validate promotion code
        const promotionResult = await Promotion.findValidByCode(
            promoCode,
            userId,
            itemsTotal, // Use original amount before discount
            storeId
        );

        if (!promotionResult.promotion || promotionResult.reason) {
            return next(new AppError(
                promotionResult.reason || 'Invalid or expired promotion code',
                400
            ));
        }

        // Recalculate discount using validated promotion
        validatedDiscount = promotionResult.promotion.calculateDiscount(itemsTotal);
        validatedPromoCode = promotionResult.promotion.code;

        // Track promotion usage (will be linked to order after creation)
        // Note: We'll track usage after order is created to ensure order ID is available
    }

    // ✅ Force payment method to cash_on_delivery only
    const paymentMethod = 'cash_on_delivery';

    // Recalculate final price with validated discount
    const itemsTotal = items.reduce((sum, item) => {
        return sum + (Number(item.itemPrice) || 0) * (Number(item.quantity) || 1);
    }, 0);
    const deliveryCharge = 30; // Default, should be calculated from store
    const validatedFinalPrice = itemsTotal + deliveryCharge - validatedDiscount;

    // ✅ EXTRACT AREA
    const area = req.body.area || 'other';

    // ✅ AUTO-ASSIGN DELIVERY BOY
    let assignedTo = null;
    try {
        const DeliveryBoy = require('../models/deliveryBoy');
        const activeBoy = await DeliveryBoy.findOne({ isActive: true });
        if (activeBoy) {
            assignedTo = activeBoy._id;
        }
    } catch (err) {
        console.error("Error auto-assigning delivery boy:", err);
    }

    // Create order with fraud flags in metadata
    const newOrder = await Order.create({
        storeId,
        userId,
        items,
        discount: validatedDiscount,
        promoCode: validatedPromoCode,
        deliveryCharge: deliveryCharge, // Store delivery charge
        finalPrice: validatedFinalPrice,
        deliveryAddress,
        paymentMethod, // ✅ Only cash on delivery
        area, // ✅ Save the area
        assignedTo, // ✅ Auto-assign delivery boy
        metadata: {
            fraudFlags: fraudFlags.length > 0 ? fraudFlags : undefined,
            fraudChecked: true,
            isHomemade: store.category === 'Homemade Food'
        }
    });

    // ✅ Track promotion usage after order creation
    if (validatedPromoCode && promoCode) {
        try {
            const promotion = await Promotion.findOne({ code: validatedPromoCode });
            if (promotion) {
                const itemsTotal = items.reduce((sum, item) => {
                    return sum + (Number(item.itemPrice) || 0) * (Number(item.quantity) || 1);
                }, 0);
                await promotion.apply(userId, newOrder._id, itemsTotal, validatedDiscount);
            }
        } catch (promoError) {
            // Log error but don't fail order creation
            console.error('Error tracking promotion usage:', promoError);
        }
    }

    // ✅ Automatically create payment record for the order
    try {
        const store = await Store.findById(storeId);
        const commissionRate = store?.commissionRate || 10;

        // ✅ FIXED: Calculate commission on final amount (what customer actually pays)
        // Commission is calculated on the amount the customer pays, not the original amount
        const originalAmount = itemsTotal + deliveryCharge; // Amount before discount
        const finalAmount = newOrder.finalPrice; // Amount after discount (what customer pays)

        const payment = await Payment.create({
            orderId: newOrder._id,
            userId: newOrder.userId,
            storeId: newOrder.storeId,
            amount: finalAmount, // Store final amount (what customer pays)
            commissionRate,
            paymentMethod: 'cash_on_delivery', // ✅ Only COD
            status: 'pending', // COD payments are pending until delivery
            payoutStatus: 'pending',
            metadata: {
                originalAmount, // Store original amount for reference
                discountAmount: validatedDiscount
            }
        });

        // ✅ FIXED: Calculate commission on final amount (what customer pays)
        // Commission = (finalAmount × commissionRate) / 100
        // Store Payout = finalAmount - commissionAmount
        payment.commissionAmount = (finalAmount * commissionRate) / 100;
        payment.storePayoutAmount = finalAmount - payment.commissionAmount;
        await payment.save();

        // Link payment to order
        newOrder.paymentId = payment._id;
        await newOrder.save();
    } catch (paymentError) {
        // Log error but don't fail order creation
        console.error('Error creating payment record:', paymentError);
        // Order is still created, payment can be created manually later if needed
    }

    // ✅ Send real-time notifications via Firebase Realtime Database
    // Notify store owner about new order
    notificationService.notifyStoreOwnerNewOrder(newOrder).catch(err => {
        console.error('Error notifying store owner:', err);
    });

    // Notify admin about new order
    notificationService.notifyAdminNewOrder(newOrder).catch(err => {
        console.error('Error notifying admin:', err);
    });

    // Notify customer about order creation
    const itemSummary = newOrder.items.map(item => `${item.quantity}x ${item.itemName || 'Item'}`).join(', ');
    notificationService.createNotification({
        userId: newOrder.userId,
        title: 'Order Placed Successfully',
        message: `Your order #${newOrder._id.toString().slice(-6)} (${itemSummary}) has been placed successfully`,
        type: 'order_created',
        relatedId: newOrder._id,
        relatedModel: 'Order',
        metadata: {
            orderId: newOrder._id,
            finalPrice: newOrder.finalPrice,
            storeId: newOrder.storeId,
            itemSummary
        }
    }).catch(err => {
        console.error('Error creating customer notification:', err);
    });

    res.status(201).json({
        success: true,
        data: {
            id: newOrder._id,
            userId: newOrder.userId,
            storeId: newOrder.storeId,
            items: newOrder.items,
            discount: newOrder.discount,
            promoCode: newOrder.promoCode,
            deliveryCharge: newOrder.deliveryCharge,
            finalPrice: newOrder.finalPrice,
            deliveryAddress: newOrder.deliveryAddress,
            status: newOrder.status,
            createdAt: newOrder.createdAt,
            updatedAt: newOrder.updatedAt
        }
    });
});

// ✅ GET CUSTOMER ORDERS - Fixed to use authenticated user
exports.getCustomerOrders = asyncHandler(async (req, res, next) => {
    // Use req.user._id instead of req.params.customerId
    const customerId = req.user._id;

    const user = await User.findById(customerId).populate({
        path: 'orders',
        select: 'items finalPrice status createdAt deliveryAddress storeId rejectionReason cancellationReason metadata',
        populate: {
            path: 'storeId',
            select: 'storeName'
        }
    });

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    res.status(200).json({
        success: true,
        data: user.orders.map(order => ({
            id: order._id || order.id,
            userId: order.userId,
            storeId: order.storeId,
            items: order.items,
            discount: order.discount,
            promoCode: order.promoCode,
            deliveryCharge: order.deliveryCharge,
            finalPrice: order.finalPrice,
            deliveryAddress: order.deliveryAddress,
            status: order.status,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            rejectionReason: order.rejectionReason,
            cancellationReason: order.cancellationReason,
            rejectionReason: order.rejectionReason,
            cancellationReason: order.cancellationReason,
            storeName: order.storeId?.storeName,
            metadata: order.metadata
        })),
        total: user.orders.length
    });
});

// ✅ UPDATE ORDER STATUS - Enhanced with rejection reason
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
    const orderId = req.params.orderId;
    const { status, rejectionReason, cancellationReason } = req.body;

    // ✅ Validate status with Rejected option
    const validStatuses = [
        "Pending", "Confirmed", "OutForDelivery",
        "Delivered", "Cancelled", "Rejected"
    ];

    if (!validStatuses.includes(status)) {
        return next(new AppError('Invalid order status', 400));
    }

    // 1) Find the order
    const order = await Order.findById(orderId);
    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // 2) Check if the current user owns the store that this order belongs to
    const store = await Store.findOne({
        _id: order.storeId,
        ownerId: req.user._id
    });

    if (!store) {
        return next(new AppError('Not authorized to update orders for this store', 403));
    }

    // ✅ Validate status transitions based on current order status
    if (order.status === 'Pending') {
        // From Pending, can only go to Confirmed or Rejected
        if (!['Confirmed', 'Rejected'].includes(status)) {
            return next(new AppError('Pending orders can only be confirmed or rejected', 400));
        }
    } else if (order.status === 'Confirmed') {
        // From Confirmed, can only go to OutForDelivery
        if (status !== 'OutForDelivery') {
            return next(new AppError('Confirmed orders can only be marked as Out for Delivery', 400));
        }
    } else if (order.status === 'OutForDelivery') {
        // From OutForDelivery, can only go to Delivered
        if (status !== 'Delivered') {
            return next(new AppError('Orders out for delivery can only be marked as Delivered', 400));
        }
    } else {
        // Delivered, Cancelled, or Rejected orders cannot be changed
        return next(new AppError(`Cannot update order status from ${order.status}`, 400));
    }

    // ✅ Prepare update data with reasons
    const updateData = { status };

    // Add rejection reason if provided and status is Rejected
    if (status === "Rejected" && rejectionReason) {
        updateData.rejectionReason = rejectionReason;
    }

    // Add cancellation reason if provided and status is Cancelled
    if (status === "Cancelled" && cancellationReason) {
        updateData.cancellationReason = cancellationReason;
    }

    // 3) Update the order status
    const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true, runValidators: true }
    ).populate('userId', 'name email phone')
        .populate('storeId', 'storeName');

    // ✅ Send real-time notifications via Firebase Realtime Database
    // Notify customer about status update
    notificationService.notifyCustomerOrderUpdate(updatedOrder, status).catch(err => {
        console.error('Error notifying customer:', err);
    });

    // Notify store owner about status update
    try {
        const store = await Store.findById(updatedOrder.storeId?._id || updatedOrder.storeId).populate('ownerId');
        if (store && store.ownerId) {
            notificationService.createNotification({
                userId: store.ownerId._id || store.ownerId,
                title: 'Order Status Updated',
                message: `Order #${updatedOrder._id.toString().slice(-6)} status updated to ${status}`,
                type: 'order_status_updated',
                relatedId: updatedOrder._id,
                relatedModel: 'Order',
                metadata: {
                    orderId: updatedOrder._id,
                    status,
                    storeId: updatedOrder.storeId?._id || updatedOrder.storeId
                }
            }).catch(err => {
                console.error('Error creating store owner notification:', err);
            });
        }
    } catch (err) {
        console.error('Error notifying store owner:', err);
    }

    // Notify admin about status update (for all statuses)
    try {
        const admins = await User.find({ role: 'admin' }).select('_id');
        const adminNotificationPromises = admins.map(admin =>
            notificationService.createNotification({
                userId: admin._id,
                title: 'Order Status Updated',
                message: `Order #${updatedOrder._id.toString().slice(-6)} status updated to ${status}`,
                type: 'order_status_updated',
                relatedId: updatedOrder._id,
                relatedModel: 'Order',
                metadata: {
                    orderId: updatedOrder._id,
                    status,
                    storeId: updatedOrder.storeId?._id || updatedOrder.storeId,
                    customerName: updatedOrder.userId?.name
                }
            })
        );
        await Promise.all(adminNotificationPromises);
    } catch (err) {
        console.error('Error creating admin notification:', err);
    }

    // Special handling: Notify admin as delivery boy when order is OutForDelivery
    if (status === 'OutForDelivery') {
        notificationService.notifyAdminDeliveryAssignment(updatedOrder).catch(err => {
            console.error('Error notifying admin about delivery assignment:', err);
        });
    }

    // ✅ Special handling: When order is Delivered, mark COD payment as completed
    if (status === 'Delivered') {
        try {
            // Set deliveredTime
            updatedOrder.deliveredTime = new Date();
            await updatedOrder.save();

            // Update payment status
            const payment = await Payment.findOne({ orderId: updatedOrder._id });
            if (payment && payment.paymentMethod === 'cash_on_delivery' && payment.status === 'pending') {
                payment.status = 'completed';
                await payment.markEligibleForPayout(); // Mark as eligible for payout
                await payment.save();
            }
        } catch (paymentError) {
            console.error('Error updating payment status on delivery:', paymentError);
            // Don't fail the order status update if payment update fails
        }
    }

    // ✅ Special handling: When order is Rejected, cancel payment
    if (status === 'Rejected') {
        try {
            const payment = await Payment.findOne({ orderId: updatedOrder._id });
            if (payment) {
                // If payment was completed, process refund
                if (payment.status === 'completed') {
                    await payment.processRefund(rejectionReason || 'Order rejected by store');
                } else {
                    // If payment is still pending (COD before delivery), mark as cancelled
                    payment.status = 'cancelled';
                    payment.payoutStatus = 'cancelled';
                    await payment.save();
                }
            }
        } catch (paymentError) {
            console.error('Error updating payment status on rejection:', paymentError);
            // Don't fail the order status update if payment update fails
        }
    }

    res.status(200).json({
        success: true,
        message: `Order status updated to ${status}`,
        data: {
            id: updatedOrder._id,
            userId: updatedOrder.userId?._id || updatedOrder.userId,
            storeId: updatedOrder.storeId?._id || updatedOrder.storeId,
            items: updatedOrder.items || [],
            discount: updatedOrder.discount,
            promoCode: updatedOrder.promoCode,
            promoCode: updatedOrder.promoCode,
            // deliveryCharge: updatedOrder.deliveryCharge, // Hidden from store owner
            finalPrice: updatedOrder.finalPrice,
            deliveryAddress: updatedOrder.deliveryAddress,
            status: updatedOrder.status,
            rejectionReason: updatedOrder.rejectionReason,
            cancellationReason: updatedOrder.cancellationReason,
            createdAt: updatedOrder.createdAt,
            updatedAt: updatedOrder.updatedAt,
            customerName: updatedOrder.userId?.name,
            customerEmail: updatedOrder.userId?.email,
            storeName: updatedOrder.storeId?.storeName
        }
    });
});

// ✅ GET STORE ORDERS - Enhanced with better population
exports.getStoreOrders = asyncHandler(async (req, res, next) => {
    // Get all stores owned by this user
    const stores = await Store.find({ ownerId: req.user._id });
    const storeIds = stores.map(store => store._id);

    // Find orders for these stores
    const orders = await Order.find({ storeId: { $in: storeIds } })
        .populate('userId', 'name email phone')
        .populate('storeId', 'storeName')
        .populate('items.menuItemId', 'name price')
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        data: orders.map(order => ({
            id: order._id,
            userId: order.userId,
            storeId: order.storeId,
            items: order.items,
            discount: order.discount,
            promoCode: order.promoCode,
            promoCode: order.promoCode,
            // deliveryCharge: order.deliveryCharge, // Check this field is hidden from store owner
            finalPrice: order.finalPrice,
            deliveryAddress: order.deliveryAddress,
            status: order.status,
            rejectionReason: order.rejectionReason,
            cancellationReason: order.cancellationReason,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            customerName: order.userId?.name,
            customerEmail: order.userId?.email,
            storeName: order.storeId?.storeName
        })),
        total: orders.length
    });
});

// ✅ CREATE ORDER FROM CART - FIXED VERSION
exports.createOrderFromCart = asyncHandler(async (req, res, next) => {
    const { deliveryAddress } = req.body;
    const userId = req.user._id;

    // ✅ Force payment method to cash_on_delivery only
    const paymentMethod = 'cash_on_delivery';

    // Get cart for the user - Cart is a separate model, not embedded in User
    const cart = await Cart.findOne({ userId }).populate('items.menuItemId', 'name price image');

    if (!cart || !cart.items || cart.items.length === 0) {
        return next(new AppError('Cart is empty', 400));
    }

    if (!deliveryAddress) {
        return next(new AppError('Delivery address is required', 400));
    }

    if (!cart.storeId) {
        return next(new AppError('Invalid cart data', 400));
    }

    // ✅ CHECK IF STORE IS OPEN
    const storeForCart = await Store.findById(cart.storeId);
    if (!storeForCart) {
        return next(new AppError('Store not found', 404));
    }
    const cartStoreStatus = isStoreOpen(storeForCart);
    if (!cartStoreStatus.isOpen) {
        return next(new AppError(`Store is currently closed: ${cartStoreStatus.reason}. Cannot place order.`, 400));
    }

    // ✅ FIXED: Use menuItemId (schema ke according) and ensure all required fields
    // If menuItemId is not populated, fetch the menu item to get name and image
    const items = await Promise.all(cart.items.map(async (item) => {
        let menuItem = item.menuItemId;
        const menuItemId = menuItem?._id || menuItem || item.menuItemId;

        // If menuItem is not populated (just an ObjectId), fetch it
        if (!menuItem || typeof menuItem === 'object' && !menuItem.name) {
            const Menu = require('../models/menuItems');
            menuItem = await Menu.findById(menuItemId);
            if (!menuItem) {
                throw new Error(`Menu item not found: ${menuItemId}`);
            }
        }

        const itemName = menuItem?.name || item.itemName;
        const itemPrice = menuItem?.price || item.price;
        const image = menuItem?.image || (Array.isArray(menuItem?.images) && menuItem.images[0]) || item.image || '/placeholder-image.jpg';

        if (!itemName) {
            throw new Error(`Item name is missing for menuItemId: ${menuItemId}`);
        }
        if (!image) {
            throw new Error(`Item image is missing for menuItemId: ${menuItemId}`);
        }

        return {
            menuItemId,
            itemName,
            quantity: item.quantity,
            itemPrice,
            image
        };
    }));

    // ✅ FIXED: Recalculate delivery charge and final amount to ensure delivery fees are included
    const amounts = await calculateFinalAmount(cart);
    const itemsTotal = amounts.itemsTotal;
    const deliveryCharge = amounts.deliveryCharge;
    const cartDiscount = cart.discount?.discountAmount || 0;
    const cartPromoCode = cart.discount?.code || null;

    // ✅ VALIDATE PROMOTION CODE IF PROVIDED
    let validatedDiscount = cartDiscount;
    let validatedPromoCode = cartPromoCode;

    if (cartPromoCode) {
        const originalAmount = itemsTotal + deliveryCharge; // Amount before discount

        // Validate promotion code
        const promotionResult = await Promotion.findValidByCode(
            cartPromoCode,
            userId,
            originalAmount,
            cart.storeId
        );

        if (!promotionResult.promotion || promotionResult.reason) {
            return next(new AppError(
                promotionResult.reason || 'Invalid or expired promotion code',
                400
            ));
        }

        // Recalculate discount using validated promotion
        validatedDiscount = promotionResult.promotion.calculateDiscount(originalAmount);
        validatedPromoCode = promotionResult.promotion.code;
    }

    const finalPrice = itemsTotal + deliveryCharge - validatedDiscount;

    // ✅ AUTO-ASSIGN DELIVERY BOY
    let assignedTo = null;
    try {
        const DeliveryBoy = require('../models/deliveryBoy');
        const activeBoy = await DeliveryBoy.findOne({ isActive: true });
        if (activeBoy) {
            assignedTo = activeBoy._id;
        }
    } catch (err) {
        console.error("Error auto-assigning delivery boy:", err);
    }

    // Create order with delivery charge stored separately for transparency
    const newOrder = await Order.create({
        storeId: cart.storeId,
        userId,
        items,
        deliveryCharge: deliveryCharge, // Store delivery charge separately
        discount: validatedDiscount,
        promoCode: validatedPromoCode,
        finalPrice,
        deliveryAddress,
        paymentMethod: 'cash_on_delivery', // ✅ Only COD
        assignedTo, // ✅ Auto-assign delivery boy
        status: "Pending"
    });

    // ✅ Track promotion usage after order creation
    if (validatedPromoCode && cartPromoCode) {
        try {
            const promotion = await Promotion.findOne({ code: validatedPromoCode });
            if (promotion) {
                const originalAmount = itemsTotal + deliveryCharge;
                await promotion.apply(userId, newOrder._id, originalAmount, validatedDiscount);
            }
        } catch (promoError) {
            // Log error but don't fail order creation
            console.error('Error tracking promotion usage:', promoError);
        }
    }

    // ✅ Automatically create payment record for the order
    try {
        const store = await Store.findById(cart.storeId);
        const commissionRate = store?.commissionRate || 10;

        // ✅ FIXED: Calculate commission on final amount (what customer actually pays)
        // Commission is calculated on the amount the customer pays, not the original amount
        const originalAmount = itemsTotal + deliveryCharge; // Amount before discount
        const finalAmount = newOrder.finalPrice; // Amount after discount (what customer pays)

        const payment = await Payment.create({
            orderId: newOrder._id,
            userId: newOrder.userId,
            storeId: newOrder.storeId,
            amount: finalAmount, // Store final amount (what customer pays)
            commissionRate,
            paymentMethod: 'cash_on_delivery', // ✅ Only COD
            status: 'pending', // COD payments are pending until delivery
            payoutStatus: 'pending',
            metadata: {
                originalAmount, // Store original amount for reference
                discountAmount: validatedDiscount
            }
        });

        // ✅ FIXED: Calculate commission on final amount (what customer pays)
        // Commission = (finalAmount × commissionRate) / 100
        // Store Payout = finalAmount - commissionAmount
        payment.commissionAmount = (finalAmount * commissionRate) / 100;
        payment.storePayoutAmount = finalAmount - payment.commissionAmount;
        await payment.save();

        // Link payment to order
        newOrder.paymentId = payment._id;
        await newOrder.save();
    } catch (paymentError) {
        // Log error but don't fail order creation
        console.error('Error creating payment record:', paymentError);
        // Order is still created, payment can be created manually later if needed
    }

    // Clear cart after successful order
    cart.items = [];
    cart.totalItems = 0;
    cart.totalAmount = 0;
    cart.deliveryCharge = 0;
    cart.finalAmount = 0;
    cart.discount = null;
    await cart.save();

    // Populate the order for response
    await newOrder.populate('storeId', 'storeName');
    await newOrder.populate('items.menuItemId', 'name');

    // ✅ Send real-time notifications via Firebase Realtime Database
    // Notify store owner about new order
    notificationService.notifyStoreOwnerNewOrder(newOrder).catch(err => {
        console.error('Error notifying store owner:', err);
    });

    // Notify admin about new order
    notificationService.notifyAdminNewOrder(newOrder).catch(err => {
        console.error('Error notifying admin:', err);
    });

    // Notify customer about order creation
    const itemSummary = newOrder.items.map(item => `${item.quantity}x ${item.itemName || 'Item'}`).join(', ');
    notificationService.createNotification({
        userId: newOrder.userId,
        title: 'Order Placed Successfully',
        message: `Your order #${newOrder._id.toString().slice(-6)} (${itemSummary}) has been placed successfully`,
        type: 'order_created',
        relatedId: newOrder._id,
        relatedModel: 'Order',
        metadata: {
            orderId: newOrder._id,
            finalPrice: newOrder.finalPrice,
            storeId: newOrder.storeId,
            itemSummary
        }
    }).catch(err => {
        console.error('Error creating customer notification:', err);
    });

    // ✅ Save address to user if it's a new address (not in saved addresses)
    try {
        const user = await User.findById(userId);
        if (user && user.addresses) {
            // Check if this address already exists in user's saved addresses
            const addressExists = user.addresses.some(addr =>
                addr.street === deliveryAddress.street &&
                addr.city === deliveryAddress.city &&
                addr.pincode === deliveryAddress.pincode
            );

            // If address doesn't exist, save it
            if (!addressExists) {
                const newAddress = {
                    label: deliveryAddress.label || 'Home',
                    street: deliveryAddress.street,
                    city: deliveryAddress.city,
                    state: deliveryAddress.state || '',
                    pincode: deliveryAddress.pincode,
                    country: deliveryAddress.country || 'India',
                    isDefault: user.addresses.length === 0, // Set as default if it's the first address
                    coordinates: deliveryAddress.coordinates || null
                };
                user.addresses.push(newAddress);
                await user.save();
            }
        }
    } catch (err) {
        // Log error but don't fail the order creation
        console.error('Error saving address to user:', err);
    }

    res.status(201).json({
        success: true,
        message: 'Order created successfully from cart',
        data: {
            id: newOrder._id,
            userId: newOrder.userId,
            storeId: newOrder.storeId,
            items: newOrder.items,
            discount: newOrder.discount,
            promoCode: newOrder.promoCode,
            deliveryCharge: newOrder.deliveryCharge,
            finalPrice: newOrder.finalPrice,
            deliveryAddress: newOrder.deliveryAddress,
            status: newOrder.status,
            paymentMethod: newOrder.paymentMethod,
            createdAt: newOrder.createdAt,
            updatedAt: newOrder.updatedAt,
            storeName: newOrder.storeId?.storeName
        }
    });
});

// ✅ CANCEL ORDER (Customer)
exports.cancelOrder = asyncHandler(async (req, res, next) => {
    const orderId = req.params.id || req.params.orderId; // Support both :id and :orderId
    const { cancellationReason } = req.body || {};

    const order = await Order.findOne({
        _id: orderId,
        userId: req.user._id // Ensure user owns the order
    });

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Check if order can be cancelled (only Pending orders)
    if (order.status !== 'Pending') {
        return next(new AppError('Order cannot be cancelled after confirmation', 400));
    }

    order.status = 'Cancelled';
    order.cancellationReason = cancellationReason;
    order.cancelledTime = new Date();

    await order.save();

    // ✅ Update payment status when order is cancelled
    try {
        const payment = await Payment.findOne({ orderId: order._id });
        if (payment) {
            // If payment was completed, process refund
            if (payment.status === 'completed') {
                await payment.processRefund(cancellationReason || 'Order cancelled by customer');
            } else {
                // If payment is still pending (COD before delivery), mark as cancelled
                payment.status = 'cancelled';
                payment.payoutStatus = 'cancelled';
                await payment.save();
            }
        }
    } catch (paymentError) {
        console.error('Error updating payment status on cancellation:', paymentError);
        // Don't fail the order cancellation if payment update fails
    }

    // ✅ Send real-time notifications via Firebase Realtime Database
    // Notify store owner about cancellation
    const store = await Store.findById(order.storeId).populate('ownerId');
    if (store && store.ownerId) {
        notificationService.createNotification({
            userId: store.ownerId._id || store.ownerId,
            title: 'Order Cancelled',
            message: `Order #${order._id.toString().slice(-6)} has been cancelled by customer`,
            type: 'order_cancelled',
            relatedId: order._id,
            relatedModel: 'Order',
            metadata: {
                orderId: order._id,
                cancellationReason,
                finalPrice: order.finalPrice
            }
        }).catch(err => {
            console.error('Error notifying store owner:', err);
        });
    }

    // Notify customer about cancellation
    notificationService.createNotification({
        userId: order.userId,
        title: 'Order Cancelled',
        message: `Your order #${order._id.toString().slice(-6)} has been cancelled`,
        type: 'order_cancelled',
        relatedId: order._id,
        relatedModel: 'Order',
        metadata: {
            orderId: order._id,
            cancellationReason
        }
    }).catch(err => {
        console.error('Error notifying customer:', err);
    });

    res.status(200).json({
        success: true,
        message: 'Order cancelled successfully',
        data: {
            id: order._id,
            userId: order.userId,
            storeId: order.storeId,
            items: order.items,
            discount: order.discount,
            promoCode: order.promoCode,
            deliveryCharge: order.deliveryCharge,
            finalPrice: order.finalPrice,
            deliveryAddress: order.deliveryAddress,
            status: order.status,
            cancellationReason: order.cancellationReason,
            cancelledTime: order.cancelledTime,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        }
    });
});

// ✅ Get all orders (admin with optional filters)
exports.getAllOrders = asyncHandler(async (req, res, next) => {
    const { status } = req.query;
    const filter = { 'metadata.isHomemade': { $ne: true } }; // Exclude Homemade Orders
    if (status) filter.status = status;
    const orders = await Order.find(filter)
        .populate('userId', 'name email')
        .populate('storeId', 'storeName')
        .sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        data: orders.map(order => ({
            id: order._id,
            userId: order.userId,
            storeId: order.storeId,
            items: order.items,
            discount: order.discount,
            promoCode: order.promoCode,
            finalPrice: order.finalPrice,
            deliveryAddress: order.deliveryAddress,
            status: order.status,
            rejectionReason: order.rejectionReason,
            cancellationReason: order.cancellationReason,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            customerName: order.userId?.name,
            customerEmail: order.userId?.email,
            storeName: order.storeId?.storeName
        })),
        total: orders.length
    });
});

// ✅ Get single order (owner or admin/delivery)
exports.getOrderById = asyncHandler(async (req, res, next) => {
    // Validate that the ID is a valid ObjectId format
    if (!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError('Invalid order ID format', 400));
    }

    const order = await Order.findById(req.params.id)
        .populate('userId', 'name email')
        .populate('storeId', 'storeName')
        .populate('items.menuItemId', 'name price');
    if (!order) return next(new AppError('Order not found', 404));

    const isOwner = order.userId && order.userId._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isDelivery = req.user.role === 'delivery';

    // Check if user is store owner of the order's store
    let isStoreOwner = false;
    if (req.user.role === 'storeOwner') {
        const store = await Store.findOne({
            _id: order.storeId,
            ownerId: req.user._id
        });
        isStoreOwner = !!store;
    }

    if (!isOwner && !isAdmin && !isDelivery && !isStoreOwner) {
        return next(new AppError('Not authorized to view this order', 403));
    }
    res.status(200).json({
        success: true,
        data: {
            id: order._id,
            userId: order.userId,
            storeId: order.storeId,
            items: order.items,
            discount: order.discount,
            promoCode: order.promoCode,
            promoCode: order.promoCode,
            deliveryCharge: (isStoreOwner && !isAdmin && !isOwner) ? undefined : order.deliveryCharge, // Hide from store owner only
            finalPrice: order.finalPrice,
            deliveryAddress: order.deliveryAddress,
            status: order.status,
            rejectionReason: order.rejectionReason,
            cancellationReason: order.cancellationReason,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            customerName: order.userId?.name,
            customerEmail: order.userId?.email,
            customerEmail: order.userId?.email,
            storeName: order.storeId?.storeName,
            metadata: order.metadata
        }
    });
});

// ✅ Public order tracking (limited info for order confirmation)
exports.getOrderPublic = asyncHandler(async (req, res, next) => {
    const orderId = req.params.orderId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return next(new AppError('Invalid order ID format', 400));
    }

    const order = await Order.findById(orderId)
        .populate('storeId', 'storeName')
        .select('status createdAt updatedAt finalPrice storeId items');

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    res.status(200).json({
        success: true,
        data: {
            id: order._id,
            status: order.status,
            finalPrice: order.finalPrice,
            storeName: order.storeId?.storeName,
            storeId: order.storeId._id,
            items: order.items,
            deliveryCharge: order.deliveryCharge,
            discount: order.discount,
            promoCode: order.promoCode,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        }
    });
});

// ✅ Admin/Delivery status update (no store ownership requirement)
exports.updateOrderStatusAdmin = asyncHandler(async (req, res, next) => {
    const { status } = req.body;
    const validStatuses = [
        "Pending", "Confirmed", "OutForDelivery",
        "Delivered", "Cancelled", "Rejected"
    ];
    if (!validStatuses.includes(status)) {
        return next(new AppError('Invalid order status', 400));
    }
    const updated = await Order.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true, runValidators: true }
    ).populate('userId', 'name email').populate('storeId', 'storeName');
    if (!updated) return next(new AppError('Order not found', 404));

    // ✅ Special handling: When order is Delivered, mark COD payment as completed
    if (status === 'Delivered') {
        try {
            // Set deliveredTime
            updated.deliveredTime = new Date();
            await updated.save();

            // Update payment status
            const payment = await Payment.findOne({ orderId: updated._id });
            if (payment && payment.paymentMethod === 'cash_on_delivery' && payment.status === 'pending') {
                payment.status = 'completed';
                await payment.markEligibleForPayout(); // Mark as eligible for payout
                await payment.save();
            }
        } catch (paymentError) {
            console.error('Error updating payment status on delivery:', paymentError);
            // Don't fail the order status update if payment update fails
        }
    }

    // ✅ Special handling: When order is Rejected, cancel payment
    if (status === 'Rejected') {
        try {
            const payment = await Payment.findOne({ orderId: updated._id });
            if (payment) {
                // If payment was completed, process refund
                if (payment.status === 'completed') {
                    await payment.processRefund('Order rejected by store');
                } else {
                    // If payment is still pending (COD before delivery), mark as cancelled
                    payment.status = 'cancelled';
                    payment.payoutStatus = 'cancelled';
                    await payment.save();
                }
            }
        } catch (paymentError) {
            console.error('Error updating payment status on rejection:', paymentError);
            // Don't fail the order status update if payment update fails
        }
    }

    // ✅ Send real-time notifications via Firebase Realtime Database
    // Notify customer about status update
    notificationService.notifyCustomerOrderUpdate(updated, status).catch(err => {
        console.error('Error notifying customer:', err);
    });

    // Special handling: Notify admin as delivery boy when order is OutForDelivery
    if (status === 'OutForDelivery') {
        notificationService.notifyAdminDeliveryAssignment(updated).catch(err => {
            console.error('Error notifying admin about delivery assignment:', err);
        });
    }

    res.status(200).json({
        success: true,
        message: `Order status updated to ${status}`,
        data: {
            id: updated._id,
            userId: updated.userId,
            storeId: updated.storeId,
            items: updated.items,
            discount: updated.discount,
            promoCode: updated.promoCode,
            deliveryCharge: updated.deliveryCharge,
            finalPrice: updated.finalPrice,
            deliveryAddress: updated.deliveryAddress,
            status: updated.status,
            rejectionReason: updated.rejectionReason,
            cancellationReason: updated.cancellationReason,
            deliveredTime: updated.deliveredTime,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            customerName: updated.userId?.name,
            customerEmail: updated.userId?.email,
            storeName: updated.storeId?.storeName
        }
    });
});

// ✅ DELIVERY BOY ENDPOINTS
exports.getDeliveryOrders = asyncHandler(async (req, res, next) => {
    // Only show orders assigned to the logged-in delivery boy
    const deliveryBoyId = req.deliveryBoy.id;
    console.log('Fetching orders for deliveryBoyId:', deliveryBoyId);
    // Since the user requested all orders to go to their single delivery boy, 
    // we fetch ALL orders from the last 24 hours.
    const query = { 
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    };    
    // Check for optional status filter from query params
    if (req.query.status) {
        query.status = req.query.status;
    }

    const orders = await Order.find(query)
        .populate('userId', 'name email phone')
        .populate('storeId', 'storeName address')
        .sort({ createdAt: -1 });

    console.log(`Found ${orders.length} orders for this delivery boy. Query:`, query);

    // Format orders
    const formattedOrders = orders.map(order => {
        // Handle Homemade Food (Thali) metadata fallback
        const isHomemade = order.metadata?.isHomemade === true;
        
        return {
            id: order._id,
            customerName: isHomemade ? order.metadata?.customerName : order.userId?.name,
            phone: isHomemade ? order.metadata?.customerPhone : order.userId?.phone,
            address: order.deliveryAddress,
            items: order.items,
            timeSlot: isHomemade ? order.metadata?.mealType : order.timeSlot,
            paymentMethod: order.paymentMethod,
            status: order.status,
            assignedTo: order.assignedTo,
            area: order.area || 'Home Delivery', // Provide fallback for grouping
            createdAt: order.createdAt,
            specialInstructions: isHomemade ? order.metadata?.orderedItems : ''
        };
    });

    // ✅ Group by area
    const groupedOrders = formattedOrders.reduce((acc, order) => {
        const area = order.area || 'Home Delivery';
        if (!acc[area]) {
            acc[area] = [];
        }
        acc[area].push(order);
        return acc;
    }, {});

    res.status(200).json({
        success: true,
        data: groupedOrders,
        total: orders.length
    });
});

exports.updateDeliveryOrderStatus = asyncHandler(async (req, res, next) => {
    const deliveryBoyId = req.deliveryBoy.id;
    const orderId = req.params.orderId;

    // Check if order exists and is assigned to this delivery boy
    const order = await Order.findOne({ _id: orderId, assignedTo: deliveryBoyId });
    if (!order) {
        return next(new AppError('Order not found or not assigned to you', 404));
    }

    const { status } = req.body;
    // Delivery boy can typically only mark as "Delivered" or "OutForDelivery" 
    // but we'll accept what's requested. Let's assume they're marking as Delivered.
    if (!status) {
        return next(new AppError('Status is required', 400));
    }

    order.status = status;
    
    if (status === 'Delivered') {
        order.deliveredTime = new Date();
        
        // Update payment status if it was COD
        try {
            const payment = await Payment.findOne({ orderId: order._id });
            if (payment && payment.paymentMethod === 'cash_on_delivery' && payment.status === 'pending') {
                payment.status = 'completed';
                await payment.markEligibleForPayout();
                await payment.save();
            }
        } catch (err) {
            console.error('Error updating payment on delivery', err);
        }
    }

    await order.save();

    res.status(200).json({
        success: true,
        message: `Order marked as ${status}`,
        data: {
            id: order._id,
            status: order.status
        }
    });
});