/**
 * Test Helper Utilities
 * Provides helper functions for creating test data with proper setup
 */

const User = require('../../models/user');
const Store = require('../../models/store');
const MenuItem = require('../../models/menuItems');

/**
 * Create a verified user for testing
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
const createVerifiedUser = async (userData) => {
  const user = await User.create({
    ...userData,
    emailVerified: true, // Auto-verify for tests
  });
  return user;
};

/**
 * Create a test store with owner
 * @param {Object} storeData - Store data
 * @param {String} ownerId - Store owner ID
 * @returns {Promise<Object>} Created store
 */
const createTestStore = async (storeData, ownerId) => {
  const store = await Store.create({
    ...storeData,
    ownerId,
  });
  return store;
};

/**
 * Create a test menu item
 * @param {Object} itemData - Menu item data
 * @param {String} storeId - Store ID
 * @returns {Promise<Object>} Created menu item
 */
const createTestMenuItem = async (itemData, storeId) => {
  const menuItem = await MenuItem.create({
    ...itemData,
    storeId,
  });
  return menuItem;
};

module.exports = {
  createVerifiedUser,
  createTestStore,
  createTestMenuItem,
};

