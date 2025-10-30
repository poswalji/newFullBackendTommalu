// routes/cartRoutes.js - OPTIMIZED FOR SEPARATE CART MODEL

const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ✅ BASIC CART OPERATIONS - PUBLIC (For both guests and logged-in users)
// These work for both guest sessions and authenticated users
/**
 * @openapi
 * /api/cart/add:
 *   post:
 *     tags: [Cart]
 *     summary: Add product to cart
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [menuItemId]
 *             properties:
 *               menuItemId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 default: 1
 *     responses:
 *       200:
 *         description: Item added
 */
router.post('/add', cartController.addToCart);
/**
 * @openapi
 * /api/cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get user’s current cart
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart
 */
router.get('/', cartController.getCart);
/**
 * @openapi
 * /api/cart/update:
 *   patch:
 *     tags: [Cart]
 *     summary: Update quantity
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [menuItemId, quantity]
 *             properties:
 *               menuItemId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated
 */
router.patch('/update', cartController.updateCartQuantity);
/**
 * @openapi
 * /api/cart/update/{itemId}:
 *   patch:
 *     tags: [Cart]
 *     summary: Update quantity by itemId
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated
 */
router.patch('/update/:itemId', cartController.updateCartQuantityById);
/**
 * @openapi
 * /api/cart/remove:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove item from cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [menuItemId]
 *             properties:
 *               menuItemId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Removed
 */
router.delete('/remove', cartController.removeFromCart);
/**
 * @openapi
 * /api/cart/remove/{itemId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove item by itemId
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Removed
 */
router.delete('/remove/:itemId', cartController.removeFromCartById);
/**
 * @openapi
 * /api/cart/clear:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear entire cart
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.delete('/clear', protect, restrictTo('customer'), cartController.clearCart);

// ✅ AUTH-ONLY CART OPERATIONS
router.post('/merge', protect, restrictTo('customer'), cartController.mergeCart);
router.post('/apply-discount', protect, restrictTo('customer'), cartController.applyDiscount);
 router.delete('/remove-discount', protect, restrictTo('customer'), cartController.removeDiscount);

// ✅ CART MAINTENANCE & UTILITY ROUTES
router.get('/status', protect, restrictTo('customer'), cartController.getCartStatus);
router.post('/clean', protect, restrictTo('customer'), cartController.cleanCart);

module.exports = router;