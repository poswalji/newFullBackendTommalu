const User = require('../models/user');
const MenuItem = require('../models/menuItems');
const Store = require('../models/store');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const Cart = require('../models/cartSchema'); // ✅ correct import path

const redisClient = null; // Optional: replace with actual redis client if available

// NOTE: In production replace this in-memory store with Redis
const guestCarts = new Map();

// Generate session ID for cookies
const generateSessionId = () => {
  return 'sess_' + Math.random().toString(36).slice(2, 18) + Date.now().toString(36);
};

// Delivery charge calculation
const calculateDeliveryCharge = (cartTotal) => (cartTotal >= 100 ? 0 : 25);

// Calculate final amount
const calculateFinalAmount = (cart) => {
  const items = cart.items || [];
  const itemsTotal = items.reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const deliveryCharge = calculateDeliveryCharge(itemsTotal);
  let finalAmount = itemsTotal + deliveryCharge;

  if (cart.discount?.discountAmount) {
    finalAmount -= Number(cart.discount.discountAmount) || 0;
    finalAmount = Math.max(0, finalAmount);
  }

  return { itemsTotal, deliveryCharge, finalAmount };
};

// Cleanup invalid cart items (for expired/unavailable)
const cleanupInvalidCartItems = async (cartLike) => {
  const itemsRef = cartLike.items || (cartLike.cart && cartLike.cart.items) || [];
  const validItems = [];

  for (let item of itemsRef) {
    try {
      const menuItem = await MenuItem.findById(item.menuItemId);
      if (menuItem && menuItem.isAvailable !== false) {
        validItems.push({
          menuItemId: item.menuItemId,
          quantity: Number(item.quantity) || 1,
          price: menuItem.price,
          itemName: menuItem.name,
        });
      }
    } catch (error) {
      // skip invalid items
    }
  }

  if (cartLike.items) cartLike.items = validItems;
  else if (cartLike.cart) cartLike.cart.items = validItems;

  return cartLike;
};

// Create or get session ID from cookie
const getOrCreateSessionId = (req, res) => {
  let sessionId = req.cookies?.sessionId;

  if (!sessionId) {
    sessionId = generateSessionId();
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    guestCarts.set(sessionId, { items: [], storeId: null, totalAmount: 0, deliveryCharge: 0, finalAmount: 0 });
    console.log('🍪 New session cookie created:', sessionId);
  }

  return sessionId;
};

// Get cart owner (user or guest)
const getCartOwner = (req, res) => {
  if (req.user?._id) return { type: 'user', id: req.user._id.toString() };
  const sessionId = getOrCreateSessionId(req, res);
  return { type: 'session', id: sessionId };
};

// Enrich guest cart items with menu data
const enrichGuestCart = async (sessionCart) => {
  if (!sessionCart?.items?.length) return sessionCart;

  const ids = sessionCart.items.map(i => i.menuItemId);
  const menuItems = await MenuItem.find({ _id: { $in: ids } }).select('name price image storeId description category isAvailable');
  const map = new Map(menuItems.map(mi => [mi._id.toString(), mi]));

  sessionCart.items = sessionCart.items.map(it => {
    const mi = map.get(it.menuItemId.toString());
    return {
      menuItemId: it.menuItemId,
      quantity: it.quantity,
      price: mi ? mi.price : it.price,
      itemName: mi ? mi.name : it.itemName,
      image: mi?.image || null,

       storeId: mi?.storeId || sessionCart.storeId,       // ✅ add storeId
    storeName: mi?.storeId?.name || sessionCart.storeName,
      description: mi?.description,
      category: mi?.category,
      isAvailable: mi?.isAvailable ?? true,
    };
  });

  return sessionCart;
};

// controllers/cartController.js
exports.addToCart = asyncHandler(async (req, res, next) => {
  const { menuItemId, quantity = 1 } = req.body;

  if (!menuItemId) return next(new AppError('menuItemId is required', 400));

  // Fetch menu item from DB to get price, image, etc.
  const menuItem = await MenuItem.findById(menuItemId).populate('storeId', 'name');
  if (!menuItem) return next(new AppError('Menu item not found', 404));
  if (menuItem.isAvailable === false) return next(new AppError('Item unavailable', 400));

  let cart;
  if (req.user?._id) {
    // ✅ Logged-in user
    const userId = req.user._id;
    cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        storeId: menuItem.storeId._id,
        storeName: menuItem.storeId.name,
        items: [],
        totalAmount: 0,
        totalItems: 0,
      });
    }

    // Prevent mixing stores
    if (cart.storeId && cart.storeId.toString() !== menuItem.storeId._id.toString()) {
      return next(new AppError('You can only order from one store at a time. Clear cart to change store.', 400));
    }

    // Add/update item
    const existingItem = cart.items.find(i => i.menuItemId.toString() === menuItemId);
    if (existingItem) {
      existingItem.quantity += Number(quantity);
      existingItem.price = menuItem.price;
    } else {
      cart.items.push({
        menuItemId,
        itemName: menuItem.name,
        price: menuItem.price,
        quantity: Number(quantity),
        image: menuItem.image || '',
         storeId: menuItem.storeId._id,
    storeName: menuItem.storeId.name
      });
    }

    // Recalculate totals
    cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    cart.totalAmount = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    await cart.save();
    await cart.populate('items.menuItemId', 'name price image storeId');

  } else {
    // ✅ Guest user
    const sessionId = getOrCreateSessionId(req, res);

    cart = guestCarts.get(sessionId) || { items: [], storeId: menuItem.storeId._id, storeName: menuItem.storeId.name };
    
    // Prevent mixing stores
    if (cart.storeId && cart.storeId.toString() !== menuItem.storeId._id.toString()) {
      return next(new AppError('You can only order from one store at a time. Clear cart to change store.', 400));
    }

    const existingItem = cart.items.find(i => i.menuItemId.toString() === menuItemId);
    if (existingItem) {
      existingItem.quantity += Number(quantity);
      existingItem.price = menuItem.price;
    } else {
      cart.items.push({
        menuItemId,
        itemName: menuItem.name,
        price: menuItem.price,
        quantity: Number(quantity),
        image: menuItem.image || '',
        storeId: menuItem.storeId._id,
    storeName: menuItem.storeId.name
      });
    }

    // Recalculate totals
    cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    cart.totalAmount = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Enrich cart to ensure images and other fields are correct
    cart = await enrichGuestCart(cart);
    guestCarts.set(sessionId, cart);
  }

  // Calculate delivery/final amount
  const amounts = calculateFinalAmount(cart);
  cart.deliveryCharge = amounts.deliveryCharge;
  cart.finalAmount = amounts.finalAmount;

  res.status(200).json({
    success: true,
    message: 'Item added to cart',
    data: cart
  });
});
// GET CART
exports.getCart = asyncHandler(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next(new AppError('Login required', 401));

  let cart = await Cart.findOne({ userId }).populate('items.menuItemId', 'name price image storeId');
  if (!cart) {
    cart = new Cart({
      userId,
      items: [],
      totalAmount: 0,
      totalItems: 0
    });
    await cart.save();
  }

  res.status(200).json({
    success: true,
    data: cart
  });
});


exports.mergeCart = asyncHandler(async (req, res, next) => {
  if (!req.user) return next(new AppError('Login required to merge cart', 401));

  const sessionId = req.cookies?.sessionId;
  if (!sessionId) {
    return res.status(200).json({
      success: true,
      message: 'No session cart to merge',
    });
  }

  const sessionCart = guestCarts.get(sessionId);
  if (!sessionCart || !sessionCart.items || sessionCart.items.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'No session cart items to merge',
    });
  }

  // Find or create user's cart
  let userCart = await Cart.findOne({ userId: req.user._id });
  if (!userCart) {
    userCart = new Cart({
      userId: req.user._id,
      storeId: sessionCart.storeId,
      storeName: sessionCart.storeName,
      items: [],
      totalAmount: 0,
      totalItems: 0,
    });
  }

  // ✅ Prevent mixing stores
  if (
    userCart.storeId &&
    sessionCart.storeId &&
    userCart.storeId.toString() !== sessionCart.storeId.toString()
  ) {
    return next(
      new AppError(
        'Cannot merge carts from different stores. Please clear one cart first.',
        400
      )
    );
  }

  // ✅ Merge items
  const mergedItemsMap = new Map();

  // Add user's existing items
  for (const ui of userCart.items || []) {
    mergedItemsMap.set(ui.menuItemId.toString(), {
      ...ui.toObject(),
      quantity: Number(ui.quantity),
    });
  }

  // Add/merge session items
  for (const si of sessionCart.items || []) {
    const key = si.menuItemId.toString();
    if (mergedItemsMap.has(key)) {
      mergedItemsMap.get(key).quantity += Number(si.quantity);
    } else {
      mergedItemsMap.set(key, {
        menuItemId: si.menuItemId,
        itemName: si.itemName,
        price: si.price,
        quantity: Number(si.quantity),
        image: si.image,
      });
    }
  }

  userCart.items = Array.from(mergedItemsMap.values());
  userCart.totalItems = userCart.items.reduce((a, i) => a + i.quantity, 0);
  userCart.totalAmount = userCart.items.reduce(
    (a, i) => a + i.price * i.quantity,
    0
  );

  await userCart.save();
  await userCart.populate('items.menuItemId', 'name price images storeId');

  // ✅ Clear guest session
  guestCarts.delete(sessionId);
  res.clearCookie('sessionId');

  res.status(200).json({
    success: true,
    message: 'Cart merged successfully',
    data: userCart,
  });
});


// UPDATE CART QUANTITY
exports.updateCartQuantity = asyncHandler(async (req, res, next) => {
  const { menuItemId, quantity } = req.body;
  const userId = req.user?._id;

  if (!userId) return next(new AppError('Login required', 401));
  if (!menuItemId || quantity < 1) return next(new AppError('Invalid data', 400));

  const cart = await Cart.findOne({ userId });
  if (!cart) return next(new AppError('Cart not found', 404));

  const item = cart.items.find(i => i.menuItemId.toString() === menuItemId);
  if (!item) return next(new AppError('Item not found in cart', 404));

  item.quantity = quantity;
  cart.totalItems = cart.items.reduce((a, i) => a + i.quantity, 0);
  cart.totalAmount = cart.items.reduce((a, i) => a + i.price * i.quantity, 0);

  await cart.save();
  await cart.populate('items.menuItemId', 'name price images storeId');

  res.status(200).json({ success: true, message: 'Quantity updated', data: cart });
});

// Update quantity via path param (compat route)
exports.updateCartQuantityById = asyncHandler(async (req, res, next) => {
  const menuItemId = req.params.itemId;
  const { quantity } = req.body;
  req.body.menuItemId = menuItemId;
  return exports.updateCartQuantity(req, res, next);
});

// REMOVE FROM CART
exports.removeFromCart = asyncHandler(async (req, res, next) => {
  const { menuItemId } = req.body;
  const userId = req.user?._id;

  if (!userId) return next(new AppError('Login required', 401));
  if (!menuItemId) return next(new AppError('menuItemId required', 400));

  const cart = await Cart.findOne({ userId });
  if (!cart) return next(new AppError('Cart not found', 404));

  cart.items = cart.items.filter(i => i.menuItemId.toString() !== menuItemId);
  cart.totalItems = cart.items.reduce((a, i) => a + i.quantity, 0);
  cart.totalAmount = cart.items.reduce((a, i) => a + i.price * i.quantity, 0);

  await cart.save();
  await cart.populate('items.menuItemId', 'name price images storeId');

  res.status(200).json({ success: true, message: 'Item removed', data: cart });
});

// Remove via path param (compat route)
exports.removeFromCartById = asyncHandler(async (req, res, next) => {
  req.body.menuItemId = req.params.itemId;
  return exports.removeFromCart(req, res, next);
});

// ✅ Apply discount to cart
exports.applyDiscount = asyncHandler(async (req, res, next) => {
  const { discountCode } = req.body;
  const userId = req.user?._id;

  const cart = await Cart.findOne({ userId });
  if (!cart || cart.items.length === 0) return next(new AppError('Cart empty', 400));

  const availableDiscounts = {
    'WELCOME10': { type: 'percentage', value: 10, minOrder: 0, maxDiscount: 100 },
    'SAVE20': { type: 'percentage', value: 20, minOrder: 500, maxDiscount: 200 },
  };

  const discount = availableDiscounts[discountCode?.toUpperCase()];
  if (!discount) return next(new AppError('Invalid discount code', 400));

  if (cart.totalAmount < discount.minOrder)
    return next(new AppError(`Minimum order ₹${discount.minOrder} required`, 400));

  let discountAmount =
    discount.type === 'percentage'
      ? (cart.totalAmount * discount.value) / 100
      : discount.value;

  if (discount.maxDiscount && discountAmount > discount.maxDiscount)
    discountAmount = discount.maxDiscount;

  cart.discount = {
    code: discountCode.toUpperCase(),
    discountAmount,
  };

  await cart.save();

  res.status(200).json({
    success: true,
    message: `Discount applied: ₹${discountAmount} off`,
    data: cart,
  });
});

// REMOVE DISCOUNT FROM CART
exports.removeDiscount = asyncHandler(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next(new AppError('Login required', 401));

  const cart = await Cart.findOne({ userId });
  if (!cart || !cart.discount) {
    return res.status(200).json({
      success: true,
      message: 'No discount applied to remove',
      data: cart || {},
    });
  }

  cart.discount = null;
  await cart.save();

  res.status(200).json({
    success: true,
    message: 'Discount removed successfully',
    data: cart,
  });
});

// ✅ NEW: Force cart cleanup endpoint
exports.cleanCart = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const cart = await Cart.findOne({ userId });

  if (!cart || cart.items.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'Cart is empty, nothing to clean',
      data: { items: [] },
    });
  }

  const initialItemCount = cart.items.length;
  const invalidItems = [];

  // Check each item and filter out invalid ones
  const validItems = [];
  for (const item of cart.items) {
    const menuItem = await MenuItem.findById(item.menuItemId);
    if (!menuItem || menuItem.isAvailable === false) {
      invalidItems.push({
        menuItemId: item.menuItemId,
        itemName: item.itemName,
        reason: !menuItem ? 'Item not found' : 'Item unavailable',
      });
    } else {
      validItems.push(item);
    }
  }

  cart.items = validItems;
  cart.totalItems = validItems.reduce((a, i) => a + i.quantity, 0);
  cart.totalAmount = validItems.reduce((a, i) => a + i.price * i.quantity, 0);

  await cart.save();
  await cart.populate('items.menuItemId', 'name price image isAvailable');

  const removedCount = initialItemCount - validItems.length;

  res.status(200).json({
    success: true,
    message:
      removedCount > 0
        ? `Cart cleaned! ${removedCount} unavailable item(s) removed.`
        : 'No invalid items found in cart.',
    data: cart,
    cleanupStats: {
      initialItems: initialItemCount,
      finalItems: validItems.length,
      removedItems: removedCount,
    },
  }); 
});

// Clear entire cart
exports.clearCart = asyncHandler(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next(new AppError('Login required', 401));
  const cart = await Cart.findOne({ userId });
  if (!cart) {
    return res.status(200).json({ success: true, message: 'Cart already empty' });
  }
  cart.items = [];
  cart.totalItems = 0;
  cart.totalAmount = 0;
  cart.discount = null;
  cart.deliveryCharge = 0;
  cart.finalAmount = 0;
  await cart.save();
  res.status(200).json({ success: true, message: 'Cart cleared', data: cart });
});

exports.getCartStatus = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const cart = await Cart.findOne({ userId });

  if (!cart || cart.items.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        hasInvalidItems: false,
        totalItems: 0,
        message: 'Cart is empty',
      },
    });
  }

  let invalidItemsCount = 0;
  const invalidItems = [];

  for (const item of cart.items) {
    try {
      const menuItem = await MenuItem.findById(item.menuItemId);
      if (!menuItem || menuItem.isAvailable === false) {
        invalidItemsCount++;
        invalidItems.push({
          menuItemId: item.menuItemId,
          itemName: item.itemName,
          reason: !menuItem ? 'Item not found' : 'Item unavailable',
        });
      }
    } catch (error) {
      invalidItemsCount++;
      invalidItems.push({
        menuItemId: item.menuItemId,
        itemName: item.itemName,
        reason: 'Error checking item',
      });
    }
  }

  res.status(200).json({
    success: true,
    data: {
      hasInvalidItems: invalidItemsCount > 0,
      totalItems: cart.items.length,
      invalidItemsCount,
      invalidItems,
      message:
        invalidItemsCount > 0
          ? `Found ${invalidItemsCount} invalid item(s) in cart`
          : 'All cart items are valid',
    },
  });
});

module.exports = exports;