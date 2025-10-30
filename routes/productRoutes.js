const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/productController');

// Public
/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Products]
 *     summary: Get all products
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Products
 */
router.get('/', ctrl.getAllProducts);
/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get single product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product
 */
router.get('/:id', ctrl.getProductById);
/**
 * @openapi
 * /api/products/category/{categoryId}:
 *   get:
 *     tags: [Products]
 *     summary: Get products by category
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Products
 */
router.get('/category/:categoryId', ctrl.getByCategory);

// Admin only
router.use(protect, restrictTo('admin'));
/**
 * @openapi
 * /api/products:
 *   post:
 *     tags: [Products]
 *     summary: Add new product
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', ctrl.createProduct);
/**
 * @openapi
 * /api/products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update product info
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', ctrl.updateProduct);
/**
 * @openapi
 * /api/products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Remove product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 */
router.delete('/:id', ctrl.deleteProduct);
/**
 * @openapi
 * /api/products/bulk:
 *   post:
 *     tags: [Products]
 *     summary: Bulk upload via CSV/Excel
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Accepted
 */
router.post('/bulk', ctrl.bulkUpload);

module.exports = router;


