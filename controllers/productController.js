const asyncHandler = require('../utils/asyncHandler');

exports.getAllProducts = asyncHandler(async (req, res) => {
    // filters: category, search, location (stubbed)
    res.status(200).json({ success: true, data: [] });
});

exports.getProductById = asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: null });
});

exports.createProduct = asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, message: 'Product created (stub)' });
});

exports.updateProduct = asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, message: 'Product updated (stub)' });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
    res.status(204).json({ success: true, data: null });
});

exports.getByCategory = asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: [] });
});

exports.bulkUpload = asyncHandler(async (req, res) => {
    res.status(202).json({ success: true, message: 'Bulk upload accepted (stub)' });
});


