const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, requireAdmin, restrictAdminTo } = require('../middleware/authMiddleware');

// All admin routes require authenticated admin
router.use(protect, requireAdmin);

// Users management
/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users with optional filters
 *     description: View all users (customers and store owners) with pagination and filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [customer, storeOwner, admin, delivery] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, suspended] }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: phone
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Users list
 */
router.get('/users', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listUsers);
/**
 * @openapi
 * /api/admin/users/{id}/suspend:
 *   patch:
 *     tags: [Admin]
 *     summary: Suspend a user
 *     description: Suspends a user account; user cannot perform restricted actions until reactivated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User suspended
 */
router.patch('/users/:id/suspend', restrictAdminTo('superAdmin'), adminController.suspendUser);
/**
 * @openapi
 * /api/admin/users/{id}/reactivate:
 *   patch:
 *     tags: [Admin]
 *     summary: Reactivate a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User reactivated
 */
router.patch('/users/:id/reactivate', restrictAdminTo('superAdmin'), adminController.reactivateUser);
/**
 * @openapi
 * /api/admin/users/{id}/reset-password:
 *   post:
 *     tags: [Admin]
 *     summary: Reset a user password manually
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset
 */
router.post('/users/:id/reset-password', restrictAdminTo('superAdmin'), adminController.resetPassword);
/**
 * @openapi
 * /api/admin/users/{id}/history/orders:
 *   get:
 *     tags: [Admin]
 *     summary: Get a user's order history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Orders history
 */
router.get('/users/:id/history/orders', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getUserOrders);
/**
 * @openapi
 * /api/admin/users/{id}/history/transactions:
 *   get:
 *     tags: [Admin]
 *     summary: Get a user's transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transactions history
 */
router.get('/users/:id/history/transactions', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getUserTransactions);

// Store verification & moderation (verification subset here)
/**
 * @openapi
 * /api/admin/stores/pending:
 *   get:
 *     tags: [Admin]
 *     summary: List pending stores for verification
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending stores
 */
router.get('/stores/pending', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listPendingStores);
/**
 * @openapi
 * /api/admin/stores/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Approve a store (makes it active)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Store approved
 */
router.post('/stores/:id/approve', restrictAdminTo('superAdmin'), adminController.approveStore);
/**
 * @openapi
 * /api/admin/stores/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Reject a store with reason
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Store rejected
 */
router.post('/stores/:id/reject', restrictAdminTo('superAdmin'), adminController.rejectStore);

// Store moderation
/**
 * @openapi
 * /api/admin/stores/{id}/suspend:
 *   patch:
 *     tags: [Admin]
 *     summary: Suspend a store
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Store suspended
 */
router.patch('/stores/:id/suspend', restrictAdminTo('superAdmin'), adminController.suspendStore);
/**
 * @openapi
 * /api/admin/stores/{id}/metadata:
 *   patch:
 *     tags: [Admin]
 *     summary: Update store metadata
 *     description: Update store category, description, timings, and delivery config.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category: { type: string }
 *               description: { type: string }
 *               openingTime: { type: string }
 *               closingTime: { type: string }
 *               deliveryFee: { type: number }
 *               minOrder: { type: number }
 *     responses:
 *       200:
 *         description: Store updated
 */
router.patch('/stores/:id/metadata', restrictAdminTo('superAdmin'), adminController.updateStoreMetadata);
/**
 * @openapi
 * /api/admin/stores/{id}/commission:
 *   patch:
 *     tags: [Admin]
 *     summary: Update store commission rate
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [commissionRate]
 *             properties:
 *               commissionRate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Commission updated
 */
router.patch('/stores/:id/commission', restrictAdminTo('superAdmin'), adminController.updateStoreCommission);

// Analytics & Reports
router.get('/analytics/dashboard', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getDashboardAnalytics);
router.get('/analytics/orders', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getOrderAnalytics);
router.get('/analytics/stores', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getStoreAnalytics);
router.get('/analytics/revenue', restrictAdminTo('superAdmin'), adminController.getRevenueAnalytics);
router.get('/reports/export', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.exportReport);

// Menu Oversight
router.get('/menu/items', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listMenuItems);
router.get('/menu/items/:id', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getMenuItemById);
router.patch('/menu/items/:id/disable', restrictAdminTo('superAdmin'), adminController.disableMenuItem);

// Dispute Resolution
router.get('/disputes', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listDisputes);
router.get('/disputes/:id', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getDisputeById);
router.post('/disputes/:id/resolve', restrictAdminTo('superAdmin'), adminController.resolveDispute);
router.post('/disputes/:id/escalate', restrictAdminTo('superAdmin'), adminController.escalateDispute);
router.post('/disputes/:id/close', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.closeDispute);

// Payout Management
router.get('/payouts', restrictAdminTo('superAdmin'), adminController.listPayouts);
router.get('/payouts/:id', restrictAdminTo('superAdmin'), adminController.getPayoutById);
router.post('/payouts/generate', restrictAdminTo('superAdmin'), adminController.generatePayout);
router.post('/payouts/:id/approve', restrictAdminTo('superAdmin'), adminController.approvePayout);
router.post('/payouts/:id/complete', restrictAdminTo('superAdmin'), adminController.completePayout);

// Order Override
router.post('/orders/:id/cancel', restrictAdminTo('superAdmin'), adminController.cancelOrderAdmin);

// All Stores (with filters)
router.get('/stores', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listAllStores);

module.exports = router;


