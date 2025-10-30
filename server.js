require('dotenv').config();

const app=require("./app");
const mongoose=require("mongoose");

const mongoUri = process.env.MONGO_URI;
if(!mongoUri){
    throw new Error("MONGO_URI is not set. Please configure it in your .env file.");
}

mongoose.connect(mongoUri).then(()=>{

    console.log("Database connected successfully 👍");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>{


console.log(`Server is running on port ${PORT}`);

});