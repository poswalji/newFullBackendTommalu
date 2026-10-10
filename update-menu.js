const mongoose = require('mongoose');
const DailyMenu = require('./models/dailyMenu');
const dns = require('node:dns');

// Fix SRV resolution for user's network
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const MONGO_URI = "mongodb+srv://maluramgurjar64:malu123@cluster0.bzfwfhh.mongodb.net/tommalu?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
.then(async () => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    console.log('Updating for', todayStr);
    
    await DailyMenu.updateOne(
        { date: todayStr },
        { 
            $set: { 
                'weekdayMenu.lunchItems': ['4 Roti', 'Rice', 'Salad', 'Dal or Lahsun Chutney', 'Chach'],
                'weekdayMenu.dinnerItems': ['4 Roti', 'Rice', 'Salad', 'Dal or Lahsun Chutney']
            } 
        }
    );
    console.log('Updated successfully');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
