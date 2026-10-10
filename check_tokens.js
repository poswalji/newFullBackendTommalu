require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const users = await User.find({ fcmTokens: { $exists: true, $not: {$size: 0} } }).select('email fcmTokens name');
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
});
