const asyncHandler = require('../utils/asyncHandler');

// Placeholder implementations – replace with DB logic later
exports.listCategories = asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: [] });
});

exports.createCategory = asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, message: 'Category created (stub)' });
});

exports.updateCategory = asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, message: 'Category updated (stub)' });
});

exports.deleteCategory = asyncHandler(async (req, res) => {
    res.status(204).json({ success: true, data: null });
});


