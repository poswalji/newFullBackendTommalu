const mongoose = require('mongoose');
const dotenv = require('dotenv');
const DailyMenu = require('./models/dailyMenu');

dotenv.config();

const DB = process.env.MONGO_URI;

mongoose
    .connect(DB, {})
    .then(async () => {
        console.log('DB connection successful!');
        
        const now = new Date();
        const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
        const parts = new Intl.DateTimeFormat('en-IN', options).formatToParts(now);
        const day = parts.find(p => p.type === 'day').value;
        const month = parts.find(p => p.type === 'month').value;
        const year = parts.find(p => p.type === 'year').value;
        const todayStr = `${year}-${month}-${day}`;
        
        console.log(`Deleting menu for: ${todayStr}`);
        
        const result = await DailyMenu.deleteOne({ date: todayStr });
        console.log('Deleted:', result);
        
        // Also delete yesterday's just in case of timezone weirdness
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yParts = new Intl.DateTimeFormat('en-IN', options).formatToParts(yesterday);
        const yDay = yParts.find(p => p.type === 'day').value;
        const yMonth = yParts.find(p => p.type === 'month').value;
        const yYear = yParts.find(p => p.type === 'year').value;
        const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;
        
        const result2 = await DailyMenu.deleteOne({ date: yesterdayStr });
        console.log(`Deleted yesterday ${yesterdayStr}:`, result2);

        // Also delete tomorrow's just in case
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tParts = new Intl.DateTimeFormat('en-IN', options).formatToParts(tomorrow);
        const tDay = tParts.find(p => p.type === 'day').value;
        const tMonth = tParts.find(p => p.type === 'month').value;
        const tYear = tParts.find(p => p.type === 'year').value;
        const tomorrowStr = `${tYear}-${tMonth}-${tDay}`;
        
        const result3 = await DailyMenu.deleteOne({ date: tomorrowStr });
        console.log(`Deleted tomorrow ${tomorrowStr}:`, result3);
        
        process.exit();
    })
    .catch(err => {
        console.error('Error connecting to DB', err);
        process.exit(1);
    });
