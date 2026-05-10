const mongoose = require('mongoose');
const Order = require('./models/orderSchema');

mongoose.connect('mongodb+srv://maluramgurjar64:malu123@cluster0.bzfwfhh.mongodb.net/tommalu?retryWrites=true&w=majority&appName=Cluster0').then(async () => {
  const getIndianTime = () => {
      return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  };
  const getTodayDateString = () => {
      const d = getIndianTime();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };
  const todayStr = getTodayDateString();
  console.log('todayStr:', todayStr);
  
  const orders = await Order.find({
      'metadata.isHomemade': true,
      $or: [
          { 'metadata.dailyMenuDate': todayStr },
          { status: { $in: ['Pending', 'Confirmed', 'OutForDelivery', 'preparing', 'ready', 'pending', 'confirmed', 'out_for_delivery'] } }
      ]
  }).sort({ createdAt: -1 });
  
  console.log('Found orders:', orders.length);
  const todaysOrders = orders.filter(o => o.metadata?.dailyMenuDate === todayStr);
  console.log('Todays orders:', todaysOrders.length);
  console.log('First order details:', JSON.stringify(orders[0], null, 2));
  process.exit(0);
}).catch(console.error);
