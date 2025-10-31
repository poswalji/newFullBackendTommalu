require('dotenv').config();

const app = require("./app");
const mongoose = require("mongoose");

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI is not set. Please configure it in your .env file.");
}

// Surface connection issues immediately instead of buffering operations for 10s
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            retryWrites: true,
            w: 'majority',
            autoIndex: process.env.NODE_ENV !== 'production'
        });
        console.log("Database connected successfully 👍");

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err.message);
        process.exit(1);
    }
}

mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
});

start();