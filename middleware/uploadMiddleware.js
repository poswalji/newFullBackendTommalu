const multer = require('multer');
const { storage } = require('../config/cloudinary');

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Single image upload middleware
exports.uploadSingle = upload.single('image');

// Multiple images upload middleware  
exports.uploadMultiple = upload.array('images', 5); // max 5 images