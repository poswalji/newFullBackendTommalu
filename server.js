require('dotenv').config();

const app=require("./app");
const mongoose=require("mongoose");

mongoose.connect("mongodb+srv://maluramgurjar64:malu123@cluster0.bzfwfhh.mongodb.net/tommalu?retryWrites=true&w=majority&appName=Cluster0").then(()=>{

    console.log("Database connected successfully 👍");
});

app.listen(3000,()=>{


console.log("Server is running on port 3000");

});