
const express=require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const customerRoutes=require('./routes/customerRoutes');
const app=express();
const storeOwnerRoutes=require('./routes/storeOwnerRoutes');
const authRoutes=require('./routes/authRoutes');

const allowedOrigins = [
  "https://tommalu.netlify.app", // Production frontend
  "http://localhost:3000",       // React dev server
  "http://localhost:5173",       // Vite dev server
  "http://127.0.0.1:3000",      // Localhost variants
  "http://127.0.0.1:5173"
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(cookieParser());

app.use(express.json());

app.use('/api/customer',customerRoutes);
app.use('/api/storeOwner',storeOwnerRoutes);
app.use('/api/auth',authRoutes);
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));

app.use((err, req, res, next) => {
  res.status(res.statusCode || 500).json({
    message: err.message,
  });
});



module.exports=app;