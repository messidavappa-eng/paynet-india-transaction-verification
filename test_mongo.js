require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
console.log("Testing Connection to:", uri.replace(/:([^:@]+)@/, ':****@'));

mongoose.connect(uri)
    .then(() => {
        console.log("✅ SUCCESS: Connected to MongoDB!");
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ ERROR: Connection failed.");
        console.error("Code:", err.code);
        console.error("Name:", err.name);
        console.error("Message:", err.message);
        process.exit(1);
    });
