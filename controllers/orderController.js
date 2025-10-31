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
const Order = require("../models/orderSchema");
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');   
const User = require("../models/user");
const Menu = require("../models/menuItems");
const Store = require("../models/store");

// ✅ CREATE ORDER - Fixed to use authenticated user
exports.createOrder = asyncHandler(async(req, res, next) => {
    // Use req.user._id from authentication instead of req.body.userId
    const { items, discount, promoCode, finalPrice, deliveryAddress } = req.body;
    const userId = req.user._id; // ✅ From authentication middleware
    
    if(!items || items.length === 0 || finalPrice <= 0) {
        return next(new AppError('Missing required fields or invalid data', 400));
    }

    // Get storeId from the first menu item (support menuItemId or menuId)
    const firstItem = items[0] || {};
    const firstMenuId = firstItem.menuItemId || firstItem.menuId;
    const menuItem = await Menu.findById(firstMenuId);
    if (!menuItem) {
        return next(new AppError("Menu item not found", 404));
    }

    const storeId = menuItem.storeId;

    // Verify user is a customer
    const user = await User.findById(userId);
    if(!user || user.role !== 'customer') {
        return next(new AppError('Only customers can create orders', 400));
    }       
    
    const newOrder = await Order.create({
        storeId, 
        userId, 
        items, 
        discount, 
        promoCode, 
        finalPrice, 
        deliveryAddress
    });
    
    res.status(201).json({
        status: 'success',
        data: {
            order: newOrder
        }
    });
});

// ✅ GET CUSTOMER ORDERS - Fixed to use authenticated user
exports.getCustomerOrders = asyncHandler(async(req, res, next) => {
    // Use req.user._id instead of req.params.customerId
    const customerId = req.user._id;
    
    const user = await User.findById(customerId).populate({
        path: 'orders',
        select: 'items finalPrice status createdAt deliveryAddress storeId rejectionReason cancellationReason',
        populate: {
            path: 'storeId',
            select: 'storeName'
        }
    });
    
    if(!user || user.role !== 'customer') {
        return next(new AppError('Customer not found', 404));
    }           
    
    res.status(200).json({
        status: 'success',
        data: {    
            totalOrders: user.orders.length,
            orders: user.orders
        }
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
    ).populate('userId', 'name email')
     .populate('storeId', 'storeName');
    
    res.status(200).json({
        success: true,
        message: `Order status updated to ${status}`,
        data: {
            order: updatedOrder
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
        data: {
            totalOrders: orders.length,
            orders
        }
    });
});

// ✅ CREATE ORDER FROM CART - FIXED VERSION
exports.createOrderFromCart = asyncHandler(async (req, res, next) => {
    const { deliveryAddress, paymentMethod = 'cash_on_delivery' } = req.body;
    const userId = req.user._id;

    // Get user with cart
    const user = await User.findById(userId).populate('cart.items.menuItemId');
    
    if (!user.cart || !user.cart.items || user.cart.items.length === 0) {
        return next(new AppError('Cart is empty', 400));
    }

    if (!deliveryAddress) {
        return next(new AppError('Delivery address is required', 400));
    }

    if (!user.cart.storeId) {
        return next(new AppError('Invalid cart data', 400));
    }

    // ✅ FIXED: Use menuItemId (schema ke according)
    const items = user.cart.items.map(item => ({
        menuItemId: item.menuItemId._id,  // ✅ Correct field name
        itemName: item.menuItemId.name,
        quantity: item.quantity,
        itemPrice: item.menuItemId.price
    }));

    // Use cart finalAmount if available, otherwise calculate
    const finalPrice = user.cart.finalAmount || user.cart.totalAmount;

    // Create order
    const newOrder = await Order.create({
        storeId: user.cart.storeId,
        userId,
        items,
        finalPrice,
        deliveryAddress,
        paymentMethod,
        status: "Pending"
    });

    // Clear cart after successful order
    user.cart = { 
        items: [], 
        storeId: null, 
        totalAmount: 0,
        deliveryCharge: 0,
        finalAmount: 0,
        discount: null
    };
    await user.save();

    // Populate the order for response
    await newOrder.populate('storeId', 'storeName');
    await newOrder.populate('items.menuItemId', 'name');

    res.status(201).json({
        status: 'success',
        message: 'Order created successfully from cart',
        data: {
            order: newOrder
        }
    });
});

// ✅ CANCEL ORDER (Customer)
exports.cancelOrder = asyncHandler(async (req, res, next) => {
    const orderId = req.params.orderId;
    const { cancellationReason } = req.body;

    const order = await Order.findOne({
        _id: orderId,
        userId: req.user._id // Ensure user owns the order
    });

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Check if order can be cancelled (only Pending or Confirmed orders)
    if (!['Pending', 'Confirmed'].includes(order.status)) {
        return next(new AppError('Order cannot be cancelled at this stage', 400));
    }

    order.status = 'Cancelled';
    order.cancellationReason = cancellationReason;
    order.cancelledTime = new Date();
    
    await order.save();

    res.status(200).json({
        success: true,
        message: 'Order cancelled successfully',
        data: { order }
    });
});

// ✅ Get all orders (admin with optional filters)
exports.getAllOrders = asyncHandler(async (req, res, next) => {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const orders = await Order.find(filter)
      .populate('userId', 'name email')
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, total: orders.length, orders });
});

// ✅ Get single order (owner or admin/delivery)
exports.getOrderById = asyncHandler(async (req, res, next) => {
    const order = await Order.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('storeId', 'storeName')
      .populate('items.menuItemId', 'name price');
    if (!order) return next(new AppError('Order not found', 404));

    const isOwner = order.userId && order.userId._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isDelivery = req.user.role === 'delivery';
    const isStoreOwner = req.user.role === 'storeOwner';
    if (!isOwner && !isAdmin && !isDelivery && !isStoreOwner) {
        return next(new AppError('Not authorized to view this order', 403));
    }
    res.status(200).json({ success: true, order });
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
    res.status(200).json({ success: true, message: `Order status updated to ${status}`, order: updated });
});