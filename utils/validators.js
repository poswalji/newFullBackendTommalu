const mongoose = require('mongoose');

/**
 * Escape special regex characters in a string
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for use in RegExp
 */
exports.escapeRegExp = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Validate if string is a valid MongoDB ObjectId
 * @param {string} id - ObjectId string to validate
 * @returns {boolean} - True if valid ObjectId
 */
exports.isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Validate and sanitize pagination parameters
 * @param {any} page - Page number
 * @param {any} limit - Items per page
 * @param {number} maxLimit - Maximum allowed limit (default: 100)
 * @returns {{page: number, limit: number, skip: number}} - Sanitized pagination values
 */
exports.sanitizePagination = (page, limit, maxLimit = 100) => {
  const pageNum = Math.max(1, Math.floor(Number(page)) || 1);
  const limitNum = Math.max(1, Math.min(maxLimit, Math.floor(Number(limit)) || 20));
  const skip = (pageNum - 1) * limitNum;
  
  return {
    page: pageNum,
    limit: limitNum,
    skip
  };
};

/**
 * Validate and sanitize string input
 * @param {any} value - Value to sanitize
 * @param {number} maxLength - Maximum length allowed
 * @param {string} defaultValue - Default value if invalid
 * @returns {string} - Sanitized string
 */
exports.sanitizeString = (value, maxLength = 500, defaultValue = '') => {
  if (typeof value !== 'string') return defaultValue;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return trimmed.substring(0, maxLength);
  return trimmed;
};

/**
 * Validate enum value
 * @param {any} value - Value to validate
 * @param {string[]} allowedValues - Array of allowed values
 * @param {any} defaultValue - Default value if invalid
 * @returns {any} - Valid enum value or default
 */
exports.validateEnum = (value, allowedValues, defaultValue = null) => {
  if (!value) return defaultValue;
  if (allowedValues.includes(value)) return value;
  return defaultValue;
};

/**
 * Validate and sanitize query search string
 * @param {any} search - Search query string
 * @param {number} maxLength - Maximum length (default: 100)
 * @returns {string|null} - Sanitized search string or null
 */
exports.sanitizeSearchQuery = (search, maxLength = 100) => {
  if (!search) return null;
  const sanitized = exports.sanitizeString(search, maxLength);
  if (sanitized.length < 1) return null;
  return exports.escapeRegExp(sanitized);
};

